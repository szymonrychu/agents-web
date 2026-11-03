import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import { listDevices, pairDevice, revokeDevice } from './api';

const BASE = '/app/admin/v1';
let f: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const cfgBody = { backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'devices', label: 'D', basePath: BASE }] };
  await loadConfig(vi.fn(async () => new Response(JSON.stringify(cfgBody))));
  f = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', f);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetConfig();
});

describe('devices api', () => {
  it('lists devices under the configured basePath', async () => {
    await listDevices();
    expect(f.mock.calls[0]).toEqual([`${BASE}/devices`, { method: 'GET', headers: undefined, body: undefined }]);
  });

  it('pairs a sketch device', async () => {
    f.mockResolvedValue(new Response('{"device_id":"d1","name":"Tab","plugin":"sketch","token":"t"}', { status: 201 }));
    const out = await pairDevice('Tab');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/devices`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Tab","plugin":"sketch"}');
    expect(out.token).toBe('t');
  });

  it('revokes a device with an encoded id', async () => {
    f.mockResolvedValue(new Response(null, { status: 204 }));
    await revokeDevice('a/b');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/devices/a%2Fb`);
    expect(init.method).toBe('DELETE');
  });

  it('throws ApiError with the status on 403', async () => {
    f.mockResolvedValue(new Response('{"error":"forbidden"}', { status: 403 }));
    await expect(listDevices()).rejects.toMatchObject({ status: 403 });
    await expect(listDevices()).rejects.toBeInstanceOf(ApiError);
  });
});
