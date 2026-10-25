import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import {
  createSchedule,
  deleteSchedule,
  getRun,
  getSchedule,
  listRuns,
  listScheduleRuns,
  listSchedules,
  previewSchedule,
  runScheduleNow,
  schedulesEnabled,
  updateSchedule,
} from './api';

const BASE = '/schedules/api/v1';
const ORCH = { id: 'orchestrator', label: 'O', basePath: '/api/v1' };
let f: ReturnType<typeof vi.fn>;

const configure = (backends: unknown[]) => loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends }))));

beforeEach(async () => {
  await configure([ORCH, { id: 'schedules', label: 'S', basePath: BASE }]);
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
const body = { name: 'n', cron: '0 * * * *', preset_id: 'p1', prompt: 'hi', enabled: true };

describe('schedules api routes', () => {
  it('lists, gets, creates, replaces and deletes schedules under the base', async () => {
    await listSchedules();
    expect(call()).toMatchObject({ url: `${BASE}/schedules`, method: 'GET' });
    f.mockClear();
    await getSchedule('a/b');
    expect(call()).toMatchObject({ url: `${BASE}/schedules/a%2Fb`, method: 'GET' });
    f.mockClear();
    await createSchedule(body);
    expect(call()).toMatchObject({ url: `${BASE}/schedules`, method: 'POST', body: JSON.stringify(body) });
    f.mockClear();
    await updateSchedule('s1', body);
    expect(call()).toMatchObject({ url: `${BASE}/schedules/s1`, method: 'PUT', body: JSON.stringify(body) });
    f.mockClear();
    f.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteSchedule('s1');
    expect(call()).toMatchObject({ url: `${BASE}/schedules/s1`, method: 'DELETE' });
  });
  it('previews, runs now and lists a schedule runs', async () => {
    await previewSchedule({ cron: '* * * * *', timezone: 'UTC' });
    expect(call()).toMatchObject({ url: `${BASE}/schedules/preview`, method: 'POST', body: '{"cron":"* * * * *","timezone":"UTC"}' });
    f.mockClear();
    await runScheduleNow('s1');
    expect(call()).toMatchObject({ url: `${BASE}/schedules/s1/run`, method: 'POST', body: undefined });
    f.mockClear();
    await listScheduleRuns('s1', 5);
    expect(call()).toMatchObject({ url: `${BASE}/schedules/s1/runs?limit=5`, method: 'GET' });
    f.mockClear();
    await listScheduleRuns('s1');
    expect(call().url).toBe(`${BASE}/schedules/s1/runs`);
  });
  it('lists all runs with status and limit, and gets one run', async () => {
    await listRuns({ status: 'failed', limit: 10 });
    expect(call()).toMatchObject({ url: `${BASE}/runs?status=failed&limit=10`, method: 'GET' });
    f.mockClear();
    await listRuns();
    expect(call().url).toBe(`${BASE}/runs`);
    f.mockClear();
    await getRun('r1');
    expect(call()).toMatchObject({ url: `${BASE}/runs/r1`, method: 'GET' });
  });
  it('uses the base path configured at call time, always relative', async () => {
    await configure([ORCH, { id: 'schedules', label: 'S', basePath: '/other/v2' }]);
    await listSchedules();
    expect(call().url).toBe('/other/v2/schedules');
    expect(call().url.startsWith('/')).toBe(true);
  });
});

describe('schedules api errors', () => {
  it('surfaces the error envelope code and message', async () => {
    f.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'no such schedule' } }), { status: 404 }));
    await expect(getSchedule('x')).rejects.toBeInstanceOf(ApiError);
    await expect(getSchedule('x')).rejects.toMatchObject({ status: 404, code: 'not_found', message: 'no such schedule' });
  });
});

describe('schedules api disabled', () => {
  it('reports enabled only when the schedules backend is configured', async () => {
    expect(schedulesEnabled()).toBe(true);
    await configure([ORCH]);
    expect(schedulesEnabled()).toBe(false);
  });
});
