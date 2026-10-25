import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { createEndpoint, deleteEndpoint, getEvent, getMeta, listEndpoints, listEvents, rotateEndpoint } from './api';

const BASE = '/webhooks/api/v1';
let f: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const cfgBody = { backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'webhooks', label: 'W', basePath: BASE }] };
  await loadConfig(vi.fn(async () => new Response(JSON.stringify(cfgBody))));
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

describe('webhooks api', () => {
  it('lists endpoints', async () => {
    await listEndpoints();
    expect(call()).toMatchObject({ url: `${BASE}/endpoints`, method: 'GET' });
  });
  it('creates an endpoint with a body', async () => {
    await createEndpoint({ suffix: 'gh' } as never);
    expect(call()).toMatchObject({ url: `${BASE}/endpoints`, method: 'POST', body: '{"suffix":"gh"}' });
  });
  it('rotates with and without a body, encoding the id', async () => {
    await rotateEndpoint('a/b');
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/a%2Fb/rotate`, method: 'POST', body: undefined });
    f.mockClear();
    await rotateEndpoint('x', {} as never);
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/x/rotate`, method: 'POST', body: '{}' });
  });
  it('deletes an endpoint', async () => {
    f.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteEndpoint('x');
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/x`, method: 'DELETE' });
  });
  it('lists events with snake_case query, skipping undefined', async () => {
    await listEvents({ status: 'failed', endpointId: 'e1', limit: 5, beforeId: 'b' });
    expect(call().url).toBe(`${BASE}/events?status=failed&endpoint_id=e1&limit=5&before_id=b`);
    f.mockClear();
    await listEvents();
    expect(call().url).toBe(`${BASE}/events`);
  });
  it('gets an event and meta', async () => {
    await getEvent('7');
    expect(call()).toMatchObject({ url: `${BASE}/events/7`, method: 'GET' });
    f.mockClear();
    await getMeta();
    expect(call()).toMatchObject({ url: `${BASE}/meta`, method: 'GET' });
  });
  it('surfaces the backend error shape', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'conflict', message: 'dup' } }), { status: 409 }));
    await expect(createEndpoint({} as never)).rejects.toBeInstanceOf(ApiError);
    await expect(createEndpoint({} as never)).rejects.toMatchObject({ status: 409, code: 'conflict', message: 'dup' });
  });
});
