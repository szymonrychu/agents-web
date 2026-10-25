/** Typed access to /api/v1, derived from the generated OpenAPI schema. */
import { backendBase } from '../config/backends';
import type { components } from './schema';

type S = components['schemas'];
export type SessionView = S['SessionView'];
export type SessionSummary = S['SessionSummary'];
export type SessionSpec = S['SessionSpec'];
export type CreateSession = S['CreateSession'];
export type AgentView = S['AgentView'];
export type MessageView = S['MessageView'];
export type MessageAccepted = S['MessageAccepted'];
export type PostMessage = S['PostMessage'];
export type CommandAccepted = S['CommandAccepted'];
export type CommandView = S['CommandView'];
export type EventView = S['EventView'];
export type EventsPage = S['EventsPage'];
export type Meta = S['Meta'];
export type CheckView = S['CheckView'];
export type CheckAccepted = S['CheckAccepted'];
export type PostCheck = S['PostCheck'];
export type PresetView = S['PresetView'];
export type PresetIn = S['PresetIn'];
export type CopyPreset = S['CopyPreset'];
export type ScaleRequest = S['ScaleRequest'];
export type ScaleResult = S['ScaleResult'];
export type InitScriptsView = S['InitScriptsView'];

export type AgentCommand = 'compact' | 'interrupt' | 'restart';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The orchestrator base path, read at call time from the runtime config. */
export const base = () => backendBase('orchestrator');

async function toError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // non-JSON error body: keep the defaults
  }
  return new ApiError(res.status, code, message);
}

export function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const request = <T>(method: string, path: string, body?: unknown): Promise<T> =>
  requestAt<T>(base(), method, path, body);

/** Like `request`, against another backend's base path. */
export async function requestAt<T>(basePath: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${basePath}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const id = encodeURIComponent;

export const listSessions = () => request<SessionView[]>('GET', '/sessions');
export const getSession = (sessionId: string) => request<SessionView>('GET', `/sessions/${id(sessionId)}`);
/** Body: exactly one of `spec` or `preset_id` (the server answers 422 otherwise); `slug` is optional with a preset. */
export const createSession = (body: CreateSession) => request<SessionView>('POST', '/sessions', body);
/** Discards the session; takes no purge parameter. */
export const deleteSession = (sessionId: string) => request<SessionView>('DELETE', `/sessions/${id(sessionId)}`);
export const getInitScripts = (sessionId: string) => request<InitScriptsView>('GET', `/sessions/${id(sessionId)}/init-scripts`);
export const putInitScripts = (sessionId: string, scripts: string[]) =>
  request<InitScriptsView>('PUT', `/sessions/${id(sessionId)}/init-scripts`, { scripts });
export const listPresets = () => request<PresetView[]>('GET', '/presets');
export const getPreset = (presetId: string) => request<PresetView>('GET', `/presets/${id(presetId)}`);
export const createPreset = (body: PresetIn) => request<PresetView>('POST', '/presets', body);
export const updatePreset = (presetId: string, body: PresetIn) => request<PresetView>('PUT', `/presets/${id(presetId)}`, body);
export const deletePreset = (presetId: string) => request<void>('DELETE', `/presets/${id(presetId)}`);
/** Copies a preset; the server names the copy when `body.name` is absent. */
export const copyPreset = (presetId: string, body?: CopyPreset) => request<PresetView>('POST', `/presets/${id(presetId)}/copy`, body);

export const listAgents = (sessionId: string) =>
  request<AgentView[]>('GET', `/sessions/${id(sessionId)}/agents`);

export const postMessage = (sessionId: string, body: PostMessage) =>
  request<MessageAccepted>('POST', `/sessions/${id(sessionId)}/messages`, body);
export const listMessages = (sessionId: string, opts: { status?: string; limit?: number } = {}) =>
  request<MessageView[]>('GET', `/sessions/${id(sessionId)}/messages${query(opts)}`);
export const getMessage = (messageId: string) => request<MessageView>('GET', `/messages/${id(messageId)}`);
export const cancelMessage = (messageId: string) => request<void>('DELETE', `/messages/${id(messageId)}`);
export const retryMessage = (messageId: string) =>
  request<MessageAccepted>('POST', `/messages/${id(messageId)}/retry`);

export const agentCommand = (agentId: string, command: AgentCommand) =>
  request<CommandAccepted>('POST', `/agents/${id(agentId)}/${command}`);
export const makeLeader = (sessionId: string, agentId: string) =>
  request<S['LeadershipRequested']>('POST', `/sessions/${id(sessionId)}/leader`, { agent_id: agentId });
/** Sets spec.replicas in place; the session view follows from the status stream. */
export const scaleSession = (sessionId: string, body: ScaleRequest) =>
  request<ScaleResult>('POST', `/sessions/${id(sessionId)}/scale`, body);
export const getCommand = (commandId: string) => request<CommandView>('GET', `/commands/${id(commandId)}`);
export const postCheck = (sessionId: string, body: PostCheck) =>
  request<CheckAccepted>('POST', `/sessions/${id(sessionId)}/checks`, body);
export const getCheck = (checkId: string) => request<CheckView>('GET', `/checks/${id(checkId)}`);

export interface EventsQuery {
  before_id?: number;
  after_id?: number;
  limit?: number;
  agent_id?: string;
  types?: string;
}
export const listEvents = (sessionId: string, opts: EventsQuery = {}) =>
  request<EventsPage>('GET', `/sessions/${id(sessionId)}/events${query({ ...opts })}`);

export const getMeta = () => request<Meta>('GET', '/meta');

export const eventStreamUrl = (sessionId: string) => `${base()}/sessions/${id(sessionId)}/events/stream`;
export const statusStreamUrl = () => `${base()}/stream`;
