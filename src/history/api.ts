/** Typed access to the agents-history API, over the `history` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase, isConfigured } from '../config/backends';
import type { components } from '../api/history-schema';

type S = components['schemas'];
export type SessionSummary = S['SessionSummary'];
export type SessionDetail = S['SessionDetail'];
export type RecordView = S['RecordView'];
export type RecordsPage = S['RecordsPage'];
export type RetentionView = S['RetentionView'];

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('history'), method, path, body);

/** True when the runtime config lists a `history` backend. */
export const historyEnabled = () => isConfigured('history');

export interface SessionsQuery {
  /** Search text, 3..500 characters. */
  q?: string;
  /** Treat `q` as a regular expression. */
  regex?: boolean;
  /** ISO 8601 */
  from?: string;
  /** ISO 8601 */
  to?: string;
  preset?: string;
  session?: string;
  limit?: number;
  before_id?: number;
}
export const listSessions = (q: SessionsQuery) =>
  req<SessionSummary[]>(
    'GET',
    `/sessions${query({ q: q.q, regex: q.regex ? 'true' : undefined, from: q.from, to: q.to, preset: q.preset, session: q.session, limit: q.limit, before_id: q.before_id })}`,
  );
export const getSession = (sessionId: string) => req<SessionDetail>('GET', `/sessions/${id(sessionId)}`);

export interface RecordsQuery {
  kind?: string;
  q?: string;
  regex?: boolean;
  before_id?: number;
  after_id?: number;
  limit?: number;
}
export const listRecords = (sessionId: string, q: RecordsQuery) =>
  req<RecordsPage>(
    'GET',
    `/sessions/${id(sessionId)}/records${query({ kind: q.kind, q: q.q, regex: q.regex ? 'true' : undefined, before_id: q.before_id, after_id: q.after_id, limit: q.limit })}`,
  );

/** Permanently deletes one history session; the user does this through the web UI only. */
export const deleteSession = (sessionId: string) => req<void>('DELETE', `/sessions/${id(sessionId)}`);

export const getRetention = () => req<RetentionView>('GET', '/settings');
export const putRetention = (days: number) => req<RetentionView>('PUT', '/settings', { retention_days: days });
