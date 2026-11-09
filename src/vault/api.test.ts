import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { createEntry, deleteEntry, errorAttachments, listEntries, listEvents, listPins, patchEntry, rotateEntry, vaultEnabled } from './api';

const BASE = '/vault/v1';
let f: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'vault', label: 'V', basePath: BASE }] }))));
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

describe('vault api routes', () => {
  it('is enabled when configured', () => expect(vaultEnabled()).toBe(true));
  it('lists with q and label', async () => {
    await listEntries({ q: 'a b', label: 'prod' });
    expect(call()).toMatchObject({ url: `${BASE}/entries?q=a+b&label=prod`, method: 'GET' });
  });
  it('posts a create', async () => {
    await createEntry({ name: 'n', description: '', labels: [], envs: [{ env: 'A', protected: true, value: 'x' }] });
    expect(call()).toMatchObject({ url: `${BASE}/entries`, method: 'POST' });
    expect(JSON.parse(call().body as string).envs[0]).toEqual({ env: 'A', protected: true, value: 'x' });
  });
  it('patches, rotates and deletes by id', async () => {
    await patchEntry('i/d', { name: 'x' });
    expect(call()).toMatchObject({ url: `${BASE}/entries/i%2Fd`, method: 'PATCH', body: '{"name":"x"}' });
    f.mockClear();
    await rotateEntry('i', { K: 'v' });
    expect(call()).toMatchObject({ url: `${BASE}/entries/i/value`, method: 'PUT', body: '{"values":{"K":"v"}}' });
    f.mockClear();
    f.mockImplementation(async () => new Response(null, { status: 204 }));
    await expect(deleteEntry('i')).resolves.toBeUndefined();
    expect(call()).toMatchObject({ url: `${BASE}/entries/i`, method: 'DELETE' });
  });
  it('patches with force only when confirmed', async () => {
    await patchEntry('i', { labels: ['project:x'] }, true);
    expect(call()).toMatchObject({ url: `${BASE}/entries/i?force=true`, method: 'PATCH' });
  });
  it('lists pins and events filtered by entry', async () => {
    await listPins('i');
    expect(call().url).toBe(`${BASE}/entries/i/pins`);
    f.mockClear();
    await listEvents('i', 10);
    expect(call().url).toBe(`${BASE}/events?entry=i&limit=10`);
  });
  it('keeps code, message and attachments of an error', async () => {
    const att = [{ preset_id: 'p', preset_name: 'Pre', env: 'E', entry_env: 'A' }];
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'vault_entry_attached', message: 'attached', attachments: att } }), { status: 409 }));
    const err = (await deleteEntry('i').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'vault_entry_attached', message: 'attached', details: { attachments: att } });
    expect(errorAttachments(err)).toEqual(att);
    expect(errorAttachments(new Error('x'))).toEqual([]);
  });
});
