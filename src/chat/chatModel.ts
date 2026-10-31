// Pure reducer turning stored orchestrator event rows into chat items (D14).

export interface EventRow {
  id: number;
  agent_id: string;
  type: string;
  ts: string;
  turn_id?: string | null;
  data: Record<string, unknown>;
}

export interface Usage {
  [key: string]: unknown;
}

interface Base {
  eventId: number;
  /** Orchestrator agent (pod) the row came from: `row.agent_id`. */
  agentId: string;
  /** Claude subagent that acted (`data.agent_id`); undefined for the main agent. */
  claudeAgentId?: string;
  agentOrdinal: number | undefined;
  ts: string;
  turnId?: string | null;
}

export type ChatItem =
  | (Base & { kind: 'user_message'; text: string; origin: string })
  | (Base & { kind: 'session'; text: string; from: string; messageId: number })
  | (Base & { kind: 'peer'; text: string; from?: string })
  | (Base & { kind: 'assistant'; text: string })
  | (Base & { kind: 'thinking'; text: string; collapsed: boolean })
  | (Base & {
      kind: 'tool';
      toolUseId: string;
      name: string;
      input: unknown;
      status: 'running' | 'ok' | 'error';
      output?: string;
    })
  | (Base & { kind: 'denied'; name: string; reason: string })
  | (Base & { kind: 'turn_end'; usage?: Usage })
  | (Base & { kind: 'error'; message: string })
  | (Base & { kind: 'gap'; fromSeq?: number; toSeq?: number })
  /** Anchor of a subagent's read-only pane in the main log; details live in ChatState.subagents. */
  | (Base & { kind: 'subagent'; claudeAgentId: string });

export type ChatKind = ChatItem['kind'];

interface ToolResult {
  output: string;
  isError: boolean;
}

export interface SubagentInfo {
  claudeAgentId: string;
  agentType?: string;
  /** Task/Agent tool_use id of the main agent call that started it. */
  parentToolUseId?: string;
  status: 'running' | 'stopped';
}

export interface ChatState {
  items: ChatItem[];
  /** Subagent metadata by claude agent id, from subagent_started/subagent_linked/subagent_stopped. */
  subagents: Readonly<Record<string, SubagentInfo>>;
  ordinals: Readonly<Record<string, number>>;
  seen: ReadonlySet<number>;
  /** tool results whose call is not (yet) in the window, by tool_use_id */
  orphanResults: Readonly<Record<string, ToolResult>>;
}

export const MAX_ITEMS = 2000;

export function emptyChat(ordinals: Readonly<Record<string, number>> = {}): ChatState {
  return { items: [], subagents: {}, ordinals, seen: new Set(), orphanResults: {} };
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v == null ? fallback : typeof v === 'object' ? JSON.stringify(v) : String(v);

const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Main-agent events carry no (or a null) data.agent_id; subagent events carry the subagent's id. */
const claudeAgentOf = (d: Record<string, unknown>): string | undefined => optStr(d.agent_id);

const USER_ORIGINS = new Set(['user', 'hook', 'restart', 'command']);

// Contract with agents-orchestrator dispatcher/session_frame.py:frame; the trailer line after the closing tag is dropped.
const SESSION_FRAME = /^<session-message from="([a-z0-9-]+)" id="(\d+)">\n([\s\S]*?)\n<\/session-message>(?:\n|$)/;

const unescapeBody = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function toolItem(base: Base, d: Record<string, unknown>, res?: ToolResult): ChatItem {
  return {
    ...base,
    kind: 'tool',
    toolUseId: str(d.tool_use_id),
    name: str(d.name ?? d.tool_name),
    input: d.tool_input ?? d.input,
    status: res ? (res.isError ? 'error' : 'ok') : 'running',
    output: res?.output,
  };
}

function usageOf(d: Record<string, unknown>): Usage | undefined {
  const rec = d.record as Record<string, unknown> | undefined;
  return ((rec?.usage ?? d.usage) as Usage | undefined) ?? undefined;
}

/** Item for a row, or null when the row yields no standalone item. */
function toItem(row: EventRow, ordinals: Readonly<Record<string, number>>, orphans: Readonly<Record<string, ToolResult>>): ChatItem | null {
  const d = row.data ?? {};
  const base: Base = {
    eventId: row.id,
    agentId: row.agent_id,
    agentOrdinal: ordinals[row.agent_id],
    ts: row.ts,
    turnId: row.turn_id,
  };
  const claudeAgentId = claudeAgentOf(d);
  if (claudeAgentId !== undefined) base.claudeAgentId = claudeAgentId;
  switch (row.type) {
    case 'subagent_started':
      return claudeAgentId === undefined ? null : { ...base, kind: 'subagent', claudeAgentId };
    case 'user_message': {
      const origin = str(d.origin, 'user');
      const text = str(d.text ?? d.message);
      const m = SESSION_FRAME.exec(text);
      if (m) return { ...base, kind: 'session', text: unescapeBody(m[3]), from: m[1], messageId: Number(m[2]) };
      if (origin === 'peer') return { ...base, kind: 'peer', text, from: d.from == null ? undefined : str(d.from) };
      return { ...base, kind: 'user_message', text, origin: USER_ORIGINS.has(origin) ? origin : 'user' };
    }
    case 'peer_message_received':
      return { ...base, kind: 'peer', text: str(d.message ?? d.text), from: d.from == null ? undefined : str(d.from) };
    case 'assistant_text':
      return { ...base, kind: 'assistant', text: str(d.text) };
    case 'thinking':
      return { ...base, kind: 'thinking', text: str(d.text ?? d.thinking), collapsed: true };
    case 'tool_call':
      return toolItem(base, d, orphans[str(d.tool_use_id)]);
    case 'tool_denied':
      return { ...base, kind: 'denied', name: str(d.name ?? d.tool_name), reason: str(d.reason) };
    case 'turn_completed':
      return { ...base, kind: 'turn_end', usage: usageOf(d) };
    case 'turn_failed':
    case 'error':
      return { ...base, kind: 'error', message: str(d.error ?? d.message ?? d.reason, row.type) };
    case 'gap':
      return {
        ...base,
        kind: 'gap',
        fromSeq: typeof d.from_seq === 'number' ? d.from_seq : undefined,
        toSeq: typeof d.to_seq === 'number' ? d.to_seq : undefined,
      };
    default:
      return null;
  }
}

function merge(state: ChatState, rows: readonly EventRow[]): ChatState {
  const seen = new Set(state.seen);
  const fresh: EventRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    fresh.push(r);
  }
  if (fresh.length === 0) return state;
  fresh.sort((a, b) => a.id - b.id);

  const orphans: Record<string, ToolResult> = { ...state.orphanResults };
  const items = state.items.slice();
  const results: EventRow[] = [];
  const added: ChatItem[] = [];
  // Results first, so a call in the same batch pairs regardless of order.
  for (const r of fresh) {
    if (r.type === 'tool_result') results.push(r);
  }
  for (const r of results) {
    const d = r.data ?? {};
    orphans[str(d.tool_use_id)] = {
      output: str(d.response ?? d.output ?? d.content),
      isError: d.is_error === true || d.status === 'error',
    };
  }
  for (const r of fresh) {
    if (r.type === 'tool_result') continue;
    const it = toItem(r, state.ordinals, orphans);
    if (it) added.push(it);
  }
  // Pair results with calls already in the window.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'tool' && it.status === 'running' && orphans[it.toolUseId]) {
      const res = orphans[it.toolUseId];
      items[i] = { ...it, status: res.isError ? 'error' : 'ok', output: res.output };
    }
  }
  const subagents: Record<string, SubagentInfo> = { ...state.subagents };
  for (const r of fresh) {
    if (r.type !== 'subagent_started' && r.type !== 'subagent_stopped' && r.type !== 'subagent_linked') continue;
    const d = r.data ?? {};
    const id = claudeAgentOf(d);
    if (id === undefined) continue;
    const prev = subagents[id];
    subagents[id] = {
      claudeAgentId: id,
      agentType: optStr(d.agent_type) ?? prev?.agentType,
      // The first non-null parent wins (subagent_started, else the late subagent_linked, else subagent_stopped).
      parentToolUseId: prev?.parentToolUseId ?? optStr(d.parent_tool_use_id),
      // A stop is final: an older page replaying the start never reopens it.
      status: r.type === 'subagent_stopped' || prev?.status === 'stopped' ? 'stopped' : 'running',
    };
  }
  for (const it of added) if (it.kind === 'tool') delete orphans[it.toolUseId];
  for (const it of items) if (it.kind === 'tool' && it.status !== 'running') delete orphans[it.toolUseId];

  const all = items.concat(added).sort((a, b) => a.eventId - b.eventId);
  return { ...state, items: all, subagents, seen, orphanResults: orphans };
}

/** Append rows (live or newer page); dedupes by event id, keeps id order. */
export function applyEvents(state: ChatState, rows: readonly EventRow[]): ChatState {
  return merge(state, rows);
}

/** Insert older rows; dedupes and keeps tool pairing across the page boundary. */
export function prependHistory(state: ChatState, rows: readonly EventRow[]): ChatState {
  return merge(state, rows);
}

/** Keep the newest `max` main-log items and, separately, the newest `max` subagent items, so a busy subagent cannot evict main rows. */
export function trimWindow(state: ChatState, max = MAX_ITEMS): ChatState {
  const isSub = (i: ChatItem): boolean => i.claudeAgentId !== undefined && i.kind !== 'subagent';
  const subCount = state.items.filter(isSub).length;
  const mainCount = state.items.length - subCount;
  if (mainCount <= max && subCount <= max) return state;
  let dropMain = Math.max(0, mainCount - max);
  let dropSub = Math.max(0, subCount - max);
  const items = state.items.filter((i) => {
    if (isSub(i)) return dropSub > 0 ? (dropSub--, false) : true;
    return dropMain > 0 ? (dropMain--, false) : true;
  });
  return { ...state, items };
}

/** Items of the given agents; an empty list means all agents. */
export function filterByAgents(items: readonly ChatItem[], ids: readonly string[]): ChatItem[] {
  if (ids.length === 0) return items.slice();
  const set = new Set(ids);
  return items.filter((i) => set.has(i.agentId));
}

export interface SubagentPaneData extends SubagentInfo {
  /** The subagent's operations (text, thinking, tools, denials), oldest first. */
  items: ChatItem[];
}

export interface SubagentSplit {
  /** Main-agent items plus one `subagent` anchor per pane not shown under its Task call. */
  main: ChatItem[];
  panes: Record<string, SubagentPaneData>;
  /** Main Task/Agent tool_use id to the subagents it started, for panes anchored at the call. */
  byToolUse: Record<string, string[]>;
}

/**
 * Split items into the main agent's log and one read-only pane per subagent.
 * A pane anchors at its Task tool call when the link is known and the call is loaded,
 * otherwise at its subagent_started item, otherwise at its first loaded operation.
 */
export function splitSubagents(items: readonly ChatItem[], subagents: Readonly<Record<string, SubagentInfo>>): SubagentSplit {
  const panes: Record<string, SubagentPaneData> = {};
  const started = new Set<string>();
  const mainToolIds = new Set<string>();
  for (const it of items) {
    const id = it.claudeAgentId;
    if (id === undefined) {
      if (it.kind === 'tool') mainToolIds.add(it.toolUseId);
      continue;
    }
    panes[id] ??= { ...(subagents[id] ?? { claudeAgentId: id, status: 'running' }), items: [] };
    if (it.kind === 'subagent') started.add(id);
    else panes[id].items.push(it);
  }
  const byToolUse: Record<string, string[]> = {};
  for (const pane of Object.values(panes)) {
    const parent = pane.parentToolUseId;
    if (parent !== undefined && mainToolIds.has(parent)) (byToolUse[parent] ??= []).push(pane.claudeAgentId);
  }
  const atTool = new Set(Object.values(byToolUse).flat());
  const anchored = new Set<string>();
  const main: ChatItem[] = [];
  for (const it of items) {
    const id = it.claudeAgentId;
    if (id === undefined) {
      main.push(it);
      continue;
    }
    if (atTool.has(id) || anchored.has(id)) continue;
    if (it.kind === 'subagent') {
      anchored.add(id);
      main.push(it);
    } else if (!started.has(id)) {
      anchored.add(id);
      main.push({ eventId: it.eventId, agentId: it.agentId, agentOrdinal: it.agentOrdinal, ts: it.ts, turnId: it.turnId, kind: 'subagent', claudeAgentId: id });
    }
  }
  return { main, panes, byToolUse };
}
