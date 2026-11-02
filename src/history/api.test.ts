import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { deleteSession, getRetention, getSession, historyEnabled, listRecords, listSessions, putRetention } from './api';

const BASE = '/history/v1';
const ORCH = { id: 'orchestrator', label: 'O', basePath: '/api/v1' };
let f: ReturnType<typeof vi.fn>;

const configure = (backends: unknown[]) => loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends }))));

beforeEach(async () => {
  await configure([ORCH, { id: 'history', label: 'H', basePath: BASE }]);
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

describe('history api routes', () => {
  it('lists sessions with the query string', async () => {
    await listSessions({ q: 'needle', regex: true, limit: 50 });
    expect(call()).toMatchObject({ url: `${BASE}/sessions?q=needle&regex=true&limit=50`, method: 'GET', body: undefined });
  });
  it('lists sessions without a query string when no filter is given', async () => {
    await listSessions({});
    expect(call().url).toBe(`${BASE}/sessions`);
  });
  it('sends every session filter, with from/to, preset, session and the cursor', async () => {
    const from = '2026-10-25T00:00:00.000Z';
    const to = '2026-11-01T00:00:00.000Z';
    await listSessions({ q: 'x y', from, to, preset: 'p1', session: 's1', limit: 10, before_id: 99 });
    expect(call().url).toBe(
      `${BASE}/sessions?q=x+y&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&preset=p1&session=s1&limit=10&before_id=99`,
    );
  });
  it('leaves regex out when it is false', async () => {
    await listSessions({ q: 'abc', regex: false });
    expect(call().url).toBe(`${BASE}/sessions?q=abc`);
  });
  it('encodes the session id in paths', async () => {
    await getSession('a/b');
    expect(call()).toMatchObject({ url: `${BASE}/sessions/a%2Fb`, method: 'GET' });
  });
  it('lists records with kind, search and cursors', async () => {
    await listRecords('a/b', { kind: 'assistant', q: 'err', regex: true, before_id: 7, after_id: 3, limit: 200 });
    expect(call()).toMatchObject({
      url: `${BASE}/sessions/a%2Fb/records?kind=assistant&q=err&regex=true&before_id=7&after_id=3&limit=200`,
      method: 'GET',
    });
  });
  it('deletes with DELETE', async () => {
    f.mockImplementation(async () => new Response(null, { status: 204 }));
    await deleteSession('s 1');
    expect(call()).toMatchObject({ url: `${BASE}/sessions/s%201`, method: 'DELETE', body: undefined });
  });
  it('reads the retention', async () => {
    await getRetention();
    expect(call()).toMatchObject({ url: `${BASE}/settings`, method: 'GET' });
  });
  it('puts retention', async () => {
    await putRetention(30);
    expect(call()).toMatchObject({ url: `${BASE}/settings`, method: 'PUT', body: '{"retention_days":30}' });
  });
  it('uses the base path configured at call time, always relative', async () => {
    await configure([ORCH, { id: 'history', label: 'H', basePath: '/other/v2' }]);
    await getRetention();
    expect(call().url).toBe('/other/v2/settings');
  });
});

describe('history api errors', () => {
  it('surfaces the error envelope code and message', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'query_too_short', message: 'q needs 3 characters' } }), { status: 422 }));
    await expect(listSessions({ q: 'a' })).rejects.toBeInstanceOf(ApiError);
    await expect(listSessions({ q: 'a' })).rejects.toMatchObject({ status: 422, code: 'query_too_short', message: 'q needs 3 characters' });
  });
});

describe('history api disabled', () => {
  it('reports enabled only when the history backend is configured', async () => {
    expect(historyEnabled()).toBe(true);
    await configure([ORCH]);
    expect(historyEnabled()).toBe(false);
  });
});
