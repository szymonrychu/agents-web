/** Hand-rolled session store for the top bar: initial REST load, live /api/v1/stream deltas, selected session id. */
import { useCallback, useEffect, useReducer } from 'react'
import { listAgents, listSessions, statusStreamUrl } from '../api/client'
import type { AgentView, SessionView } from '../api/client'
import { STATUS_EVENTS, openStream, statusEventFromFrame } from '../api/stream'
import type { StatusEvent } from '../api/stream'

export interface SessionEntry {
  session: SessionView
  /** Agents by id, ordered by ordinal when read through `sortedAgents`. */
  agents: Record<string, AgentView>
}

export interface SessionsState {
  sessions: Record<string, SessionEntry>
  selectedId: string | null
  loaded: boolean
  error: string | null
}

export type SessionsAction =
  | StatusEvent
  | { type: 'loaded'; entries: SessionEntry[] }
  | { type: 'failed'; message: string }
  | { type: 'select'; id: string | null }

export const initialState: SessionsState = { sessions: {}, selectedId: null, loaded: false, error: null }

const byId = (agents: AgentView[]): Record<string, AgentView> => Object.fromEntries(agents.map((a) => [a.id, a]))
const toRecord = (entries: { session: SessionView; agents: AgentView[] }[]): Record<string, SessionEntry> =>
  Object.fromEntries(entries.map((e) => [e.session.id, { session: e.session, agents: byId(e.agents) }]))

/** The selection survives only while its session exists. */
function keepSelection(state: SessionsState, sessions: Record<string, SessionEntry>): string | null {
  return state.selectedId !== null && state.selectedId in sessions ? state.selectedId : null
}

export function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.type) {
    case 'loaded': {
      // The stream may already have delivered fresher data: only fill in what it has not.
      const loaded = toRecord(action.entries.map((e) => ({ session: e.session, agents: Object.values(e.agents) })))
      const sessions = state.loaded ? state.sessions : { ...loaded, ...state.sessions }
      return { ...state, sessions, loaded: true, error: null, selectedId: keepSelection(state, sessions) }
    }
    case 'failed':
      return { ...state, error: action.message, loaded: true }
    case 'snapshot': {
      const sessions = toRecord(action.sessions)
      return { ...state, sessions, loaded: true, error: null, selectedId: keepSelection(state, sessions) }
    }
    case 'session_status': {
      const prev = state.sessions[action.session.id]
      return { ...state, sessions: { ...state.sessions, [action.session.id]: { session: action.session, agents: prev?.agents ?? {} } } }
    }
    case 'agent_status': {
      const prev = state.sessions[action.sessionId]
      if (!prev) return state
      return { ...state, sessions: { ...state.sessions, [action.sessionId]: { ...prev, agents: { ...prev.agents, [action.agent.id]: action.agent } } } }
    }
    case 'leader_changed': {
      const prev = state.sessions[action.sessionId]
      if (!prev) return state
      const agents = Object.fromEntries(Object.entries(prev.agents).map(([id, a]) => [id, { ...a, leader: id === action.agentId }]))
      const session = { ...prev.session, leader_agent_id: action.agentId, leader_epoch: action.epoch }
      return { ...state, sessions: { ...state.sessions, [action.sessionId]: { session, agents } } }
    }
    case 'message_status': {
      const prev = state.sessions[action.sessionId]
      if (!prev) return state
      const summary = { ...prev.session.summary, queued: action.queued, failed: action.failed }
      return { ...state, sessions: { ...state.sessions, [action.sessionId]: { ...prev, session: { ...prev.session, summary } } } }
    }
    case 'session_removed': {
      if (!(action.sessionId in state.sessions)) return state
      const sessions = { ...state.sessions }
      delete sessions[action.sessionId]
      return { ...state, sessions, selectedId: keepSelection(state, sessions) }
    }
    case 'select':
      return { ...state, selectedId: action.id }
  }
}

/** Sessions ordered by slug. */
export const sortedSessions = (state: SessionsState): SessionEntry[] =>
  Object.values(state.sessions).sort((a, b) => a.session.slug.localeCompare(b.session.slug))

/** Live agents of a session ordered by ordinal; agents whose pod is gone are hidden. */
export const sortedAgents = (entry: SessionEntry): AgentView[] =>
  Object.values(entry.agents)
    .filter((a) => !a.gone)
    .sort((a, b) => a.ordinal - b.ordinal)

export function useSessions() {
  const [state, dispatch] = useReducer(sessionsReducer, initialState)

  useEffect(() => {
    let cancelled = false
    const stream = openStream(statusStreamUrl(), {
      eventNames: [...STATUS_EVENTS],
      onEvent: (data, info) => {
        const action = statusEventFromFrame(info.type, data)
        if (action && !cancelled) dispatch(action)
      },
    })
    listSessions()
      .then((sessions) => Promise.all(sessions.map(async (session) => ({ session, agents: byId(await listAgents(session.id)) }))))
      .then((entries) => {
        if (!cancelled) dispatch({ type: 'loaded', entries })
      })
      .catch((e: unknown) => {
        if (!cancelled) dispatch({ type: 'failed', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
      stream.close()
    }
  }, [])

  const select = useCallback((id: string | null) => dispatch({ type: 'select', id }), [])
  return { state, sessions: sortedSessions(state), select }
}
