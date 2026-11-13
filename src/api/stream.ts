/** EventSource wrapper: tracks the last event id, reconnects with capped exponential backoff. */
import type { AgentView, SessionView } from './client';
import { isSessionExpired, markSessionExpired } from './session';

export interface StreamInfo {
  type: string;
  id: string;
}

export interface StreamOptions {
  onEvent: (data: unknown, info: StreamInfo) => void;
  onOpen?: () => void;
  onError?: () => void;
  afterId?: number;
  /** Named SSE events to listen to (EventSource has no wildcard); unnamed frames are always handled. */
  eventNames?: string[];
  /** Injectable for tests. */
  eventSource?: typeof EventSource;
}

export interface Stream {
  close(): void;
}

export const BACKOFF_START_MS = 1000;
export const BACKOFF_MAX_MS = 30000;

function withAfterId(url: string, afterId: number | undefined): string {
  if (afterId === undefined) return url;
  return `${url}${url.includes('?') ? '&' : '?'}after_id=${afterId}`;
}

/**
 * EventSource cannot set headers, so it sends `Accept: text/event-stream` and an expired login gets a 302 plus a new
 * CSRF cookie on every reconnect. After an error, one fetch that also accepts JSON (the SSO proxy then answers 401
 * and sets no cookie) tells an expired session from a network blip; a live answer is aborted at its headers.
 */
async function probeExpired(url: string): Promise<boolean> {
  const abort = new AbortController();
  try {
    const res = await fetch(url, { headers: { Accept: 'text/event-stream, application/json' }, signal: abort.signal });
    return res.status === 401;
  } catch {
    return false;
  } finally {
    abort.abort();
  }
}

export function openStream(url: string, opts: StreamOptions): Stream {
  const Source = opts.eventSource ?? EventSource;
  let lastId: number | undefined = opts.afterId;
  let delay = BACKOFF_START_MS;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const handle = (type: string) => (e: MessageEvent) => {
    if (closed) return;
    delay = BACKOFF_START_MS;
    if (e.lastEventId !== '' && Number.isFinite(Number(e.lastEventId))) lastId = Number(e.lastEventId);
    let data: unknown;
    try {
      data = JSON.parse(e.data as string);
    } catch {
      data = e.data;
    }
    opts.onEvent(data, { type, id: e.lastEventId });
  };

  const connect = () => {
    timer = null;
    if (closed || isSessionExpired()) return;
    const es = new Source(withAfterId(url, lastId));
    source = es;
    es.onopen = () => {
      if (!closed) opts.onOpen?.();
    };
    es.onmessage = handle('message');
    for (const name of opts.eventNames ?? []) es.addEventListener(name, handle(name) as EventListener);
    es.onerror = () => {
      es.close();
      if (closed || source !== es) return;
      opts.onError?.();
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
      void probeExpired(url).then((expired) => {
        if (!expired) return;
        markSessionExpired();
        if (timer !== null) clearTimeout(timer);
        timer = null;
      });
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      source?.close();
    },
  };
}

/** Named frames of the /api/v1/stream status stream. */
export const STATUS_EVENTS = ['snapshot', 'session_status', 'agent_status', 'leader_changed', 'message_status', 'session_removed'] as const;

/** One decoded status stream frame. */
export type StatusEvent =
  | { type: 'snapshot'; sessions: { session: SessionView; agents: AgentView[] }[] }
  | { type: 'session_status'; session: SessionView }
  | { type: 'agent_status'; sessionId: string; agent: AgentView }
  | { type: 'leader_changed'; sessionId: string; agentId: string; epoch: number; reason: string | null }
  | { type: 'message_status'; sessionId: string; queued: number; failed: number; oldestQueuedAt: string | null }
  | { type: 'session_removed'; sessionId: string };

/** Maps one status stream frame to its event; null for frames the app ignores. */
export function statusEventFromFrame(type: string, data: unknown): StatusEvent | null {
  const d = data as Record<string, unknown> | null;
  if (d === null || typeof d !== 'object') return null;
  switch (type) {
    case 'snapshot':
      return { type: 'snapshot', sessions: d.sessions as { session: SessionView; agents: AgentView[] }[] };
    case 'session_status':
      return { type: 'session_status', session: d.session as SessionView };
    case 'agent_status':
      return { type: 'agent_status', sessionId: d.session_id as string, agent: d.agent as AgentView };
    case 'leader_changed':
      return { type: 'leader_changed', sessionId: d.session_id as string, agentId: d.agent_id as string, epoch: d.epoch as number, reason: (d.reason as string | null | undefined) ?? null };
    case 'message_status':
      return {
        type: 'message_status',
        sessionId: d.session_id as string,
        queued: d.queued as number,
        failed: d.failed as number,
        oldestQueuedAt: (d.oldest_queued_at as string | null | undefined) ?? null,
      };
    case 'session_removed':
      return { type: 'session_removed', sessionId: d.session_id as string };
    default:
      return null;
  }
}
