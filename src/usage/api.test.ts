import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { getCurrent, getHistory, getSessions, usageEnabled } from './api';

const BASE = '/usage/v1';
const ORCH = { id: 'orchestrator', label: 'O', basePath: '/api/v1' };
let f: ReturnType<typeof vi.fn>;

const configure = (backends: unknown[]) => loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends }))));

beforeEach(async () => {
  await configure([ORCH, { id: 'usage', label: 'U', basePath: BASE }]);
  f = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', f);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetConfig();
});

const call = () => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: init.body };
};

describe('usage api routes', () => {
  it('gets the current windows under the base', async () => {
    await getCurrent();
    expect(call()).toMatchObject({ url: `${BASE}/current`, method: 'GET', body: undefined });
  });
  it('gets the history with metric, ISO from/to and max_points', async () => {
    const from = '2026-10-25T00:00:00.000Z';
    const to = '2026-11-01T00:00:00.000Z';
    await getHistory({ metric: 'seven_day', from, to, max_points: 500 });
    expect(call()).toMatchObject({
      url: `${BASE}/history?metric=seven_day&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max_points=500`,
      method: 'GET',
    });
  });
  it('leaves out the history parameters that are not given', async () => {
    await getHistory({});
    expect(call().url).toBe(`${BASE}/history`);
  });
  it('gets the session marks with ISO from/to and limit', async () => {
    const from = '2026-10-25T00:00:00.000Z';
    const to = '2026-11-01T00:00:00.000Z';
    await getSessions({ from, to, limit: 1000 });
    expect(call()).toMatchObject({
      url: `${BASE}/sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1000`,
      method: 'GET',
    });
  });
  it('uses the base path configured at call time, always relative', async () => {
    await configure([ORCH, { id: 'usage', label: 'U', basePath: '/other/v2' }]);
    await getCurrent();
    expect(call().url).toBe('/other/v2/current');
  });
});

describe('usage api errors', () => {
  it('surfaces the error envelope code and message', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'from must be before to' } }), { status: 422 }));
    await expect(getSessions({})).rejects.toBeInstanceOf(ApiError);
    await expect(getSessions({})).rejects.toMatchObject({ status: 422, code: 'invalid_request', message: 'from must be before to' });
  });
});

describe('usage api disabled', () => {
  it('reports enabled only when the usage backend is configured', async () => {
    expect(usageEnabled()).toBe(true);
    await configure([ORCH]);
    expect(usageEnabled()).toBe(false);
  });
});
