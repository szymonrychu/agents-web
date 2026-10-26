import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import {
  addRule,
  deleteRule,
  getMeta,
  getRoom,
  getSettings,
  listMessages,
  listRoomMessages,
  listRooms,
  listRules,
  listUsers,
  setRoomSettings,
  setSettings,
} from './api';

const BASE = '/matrix/api/v1';
let f: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const cfgBody = { backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'matrix', label: 'M', basePath: BASE }] };
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
const next = async (fn: () => Promise<unknown>) => {
  f.mockClear();
  await fn();
  return call();
};

describe('matrix api', () => {
  it('calls the matrix API under the configured basePath', async () => {
    const room = '!a/b:hs.org';
    const enc = '!a%2Fb%3Ahs.org';
    expect(await next(() => getMeta())).toMatchObject({ url: `${BASE}/meta`, method: 'GET' });
    expect(await next(() => listRooms())).toMatchObject({ url: `${BASE}/rooms`, method: 'GET' });
    expect((await next(() => listRooms({ kind: 'dm', access: 'allowed' }))).url).toBe(`${BASE}/rooms?kind=dm&access=allowed`);
    expect(await next(() => getRoom(room))).toMatchObject({ url: `${BASE}/rooms/${enc}`, method: 'GET' });
    expect(await next(() => setRoomSettings(room, { preset_id: 'p1', trigger: 'always' } as never))).toMatchObject({
      url: `${BASE}/rooms/${enc}/settings`,
      method: 'PUT',
      body: '{"preset_id":"p1","trigger":"always"}',
    });
    expect((await next(() => listRoomMessages(room, { limit: 5, beforeId: '9' }))).url).toBe(`${BASE}/rooms/${enc}/messages?limit=5&before_id=9`);
    expect((await next(() => listRoomMessages(room))).url).toBe(`${BASE}/rooms/${enc}/messages`);
    expect((await next(() => listUsers({ q: 'al ice', limit: 10 }))).url).toBe(`${BASE}/users?q=al+ice&limit=10`);
    expect((await next(() => listUsers())).url).toBe(`${BASE}/users`);
    expect(await next(() => listRules())).toMatchObject({ url: `${BASE}/rules`, method: 'GET' });
    expect(await next(() => addRule({ list: 'allow', kind: 'user', value: '@a:hs', note: 'n' } as never))).toMatchObject({
      url: `${BASE}/rules`,
      method: 'POST',
      body: '{"list":"allow","kind":"user","value":"@a:hs","note":"n"}',
    });
    f.mockImplementation(async () => new Response(null, { status: 204 }));
    expect(await next(() => deleteRule('3'))).toMatchObject({ url: `${BASE}/rules/3`, method: 'DELETE' });
    f.mockImplementation(async () => new Response('{}', { status: 200 }));
    expect(await next(() => getSettings())).toMatchObject({ url: `${BASE}/settings`, method: 'GET' });
    expect(await next(() => setSettings({ default_preset_id: 'p' } as never))).toMatchObject({
      url: `${BASE}/settings`,
      method: 'PUT',
      body: '{"default_preset_id":"p"}',
    });
    expect((await next(() => listMessages({ status: 'failed', roomId: '!r:hs', limit: 2, beforeId: '4' }))).url).toBe(
      `${BASE}/messages?status=failed&room_id=%21r%3Ahs&limit=2&before_id=4`,
    );
    expect((await next(() => listMessages())).url).toBe(`${BASE}/messages`);
  });
  it('surfaces backend error codes', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'no room' } }), { status: 404 }));
    await expect(getRoom('!x:hs')).rejects.toBeInstanceOf(ApiError);
    await expect(getRoom('!x:hs')).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'no room' });
  });
});
