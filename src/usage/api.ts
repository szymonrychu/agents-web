/** Typed access to the agents-usage API, over the `usage` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase, isConfigured } from '../config/backends';
import type { components } from '../api/usage-schema';

type S = components['schemas'];
export type CurrentView = S['CurrentView'];
export type WindowView = S['WindowView'];
export type LastProbeView = S['LastProbeView'];
export type HistoryView = S['HistoryView'];
export type PointView = S['PointView'];
export type SessionsView = S['SessionsView'];
export type MarkView = S['MarkView'];

const req = <T>(path: string) => requestAt<T>(backendBase('usage'), 'GET', path);

/** True when the runtime config lists a `usage` backend. */
export const usageEnabled = () => isConfigured('usage');

/** The newest reading per window (five_hour, seven_day); a window with no live data is absent. */
export const getCurrent = () => req<CurrentView>('/current');

export interface HistoryQuery {
  metric?: string;
  /** ISO 8601 */
  from?: string;
  /** ISO 8601 */
  to?: string;
  max_points?: number;
}
export const getHistory = (q: HistoryQuery) =>
  req<HistoryView>(`/history${query({ metric: q.metric, from: q.from, to: q.to, max_points: q.max_points })}`);

export interface SessionsQuery {
  /** ISO 8601 */
  from?: string;
  /** ISO 8601 */
  to?: string;
  limit?: number;
}
export const getSessions = (q: SessionsQuery) => req<SessionsView>(`/sessions${query({ from: q.from, to: q.to, limit: q.limit })}`);
