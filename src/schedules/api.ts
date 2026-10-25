/** Typed access to the schedule API, over the `schedules` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase, isConfigured } from '../config/backends';
import type { components } from '../api/schedules-schema';

type S = components['schemas'];
export type ScheduleView = S['ScheduleView'];
export type ScheduleIn = S['ScheduleIn'];
export type RunView = S['RunView'];
export type PreviewIn = S['PreviewIn'];
export type PreviewView = S['PreviewView'];

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('schedules'), method, path, body);

/** True when the runtime config lists a `schedules` backend. */
export const schedulesEnabled = () => isConfigured('schedules');

export const listSchedules = () => req<ScheduleView[]>('GET', '/schedules');
export const getSchedule = (scheduleId: string) => req<ScheduleView>('GET', `/schedules/${id(scheduleId)}`);
export const createSchedule = (body: ScheduleIn) => req<ScheduleView>('POST', '/schedules', body);
/** Replaces the schedule wholesale. */
export const updateSchedule = (scheduleId: string, body: ScheduleIn) => req<ScheduleView>('PUT', `/schedules/${id(scheduleId)}`, body);
export const deleteSchedule = (scheduleId: string) => req<void>('DELETE', `/schedules/${id(scheduleId)}`);
/** Computes the next fire times for a cron expression; nothing is stored. */
export const previewSchedule = (body: PreviewIn) => req<PreviewView>('POST', '/schedules/preview', body);
/** Queues an immediate run of the schedule. */
export const runScheduleNow = (scheduleId: string) => req<RunView>('POST', `/schedules/${id(scheduleId)}/run`);
export const listScheduleRuns = (scheduleId: string, limit?: number) =>
  req<RunView[]>('GET', `/schedules/${id(scheduleId)}/runs${query({ limit })}`);

export interface RunsQuery {
  status?: string;
  limit?: number;
}
export const listRuns = (opts: RunsQuery = {}) => req<RunView[]>('GET', `/runs${query({ status: opts.status, limit: opts.limit })}`);
export const getRun = (runId: string) => req<RunView>('GET', `/runs/${id(runId)}`);
