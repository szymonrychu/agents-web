import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { cloneEndpoint, createEndpoint, deleteEndpoint, getEvent, getMeta, listEndpoints, listEvents, patchEndpoint, previewTemplate, rotateEndpoint, setEndpointFilters } from './api';

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
  it('patches an endpoint with only the given fields, encoding the id', async () => {
    await patchEndpoint('a/b', { auth_mode: 'header', auth_header: 'X-Gitlab-Token' });
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/a%2Fb`, method: 'PATCH', body: '{"auth_mode":"header","auth_header":"X-Gitlab-Token"}' });
  });
  it('clones with and without overrides, encoding the id', async () => {
    await cloneEndpoint('a/b');
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/a%2Fb/clone`, method: 'POST', body: undefined });
    f.mockClear();
    await cloneEndpoint('x', { suffix: 'new' });
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/x/clone`, method: 'POST', body: '{"suffix":"new"}' });
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
  it('previews a template against an example payload', async () => {
    await previewTemplate({ template: '{{ repo }}', type: 'github-pr', example: { a: 1 } });
    expect(call()).toMatchObject({ url: `${BASE}/templates/preview`, method: 'POST', body: '{"template":"{{ repo }}","type":"github-pr","example":{"a":1}}' });
  });
  it('previews filters without a template', async () => {
    const filters = { allow: [{ field: 'repo', match: 'equals' as const, values: ['a/b'] }], deny: [] };
    await previewTemplate({ type: 'github-pr', example: { a: 1 }, filters });
    expect(call()).toMatchObject({ url: `${BASE}/templates/preview`, method: 'POST', body: JSON.stringify({ type: 'github-pr', example: { a: 1 }, filters }) });
  });
  it('replaces endpoint filters', async () => {
    const filters = { allow: [], deny: [{ field: 'author', match: 'regex' as const, values: ['bot.*'] }] };
    await setEndpointFilters('a/b c', filters);
    expect(call()).toMatchObject({ url: `${BASE}/endpoints/a%2Fb%20c/filters`, method: 'PUT', body: JSON.stringify(filters) });
  });
  it('surfaces the backend error shape', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'conflict', message: 'dup' } }), { status: 409 }));
    await expect(createEndpoint({} as never)).rejects.toBeInstanceOf(ApiError);
    await expect(createEndpoint({} as never)).rejects.toMatchObject({ status: 409, code: 'conflict', message: 'dup' });
  });
});
