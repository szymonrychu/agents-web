/** Hand-rolled cluster store for the top bar: initial REST load, live /api/v1/stream deltas, selected cluster id. */
import { useCallback, useEffect, useReducer } from 'react'
import { listAgents, listSessions, statusStreamUrl } from '../api/client'
import type { AgentView, SessionView } from '../api/client'
import { STATUS_EVENTS, openStream, statusEventFromFrame } from '../api/stream'
import type { StatusEvent } from '../api/stream'

export interface ClusterEntry {
  cluster: SessionView
  /** Agents by id, ordered by ordinal when read through `sortedAgents`. */
  agents: Record<string, AgentView>
}

export interface ClustersState {
  clusters: Record<string, ClusterEntry>
  selectedId: string | null
  loaded: boolean
  error: string | null
}

export type ClustersAction =
  | StatusEvent
  | { type: 'loaded'; entries: ClusterEntry[] }
  | { type: 'failed'; message: string }
  | { type: 'select'; id: string | null }

export const initialState: ClustersState = { clusters: {}, selectedId: null, loaded: false, error: null }

const byId = (agents: AgentView[]): Record<string, AgentView> => Object.fromEntries(agents.map((a) => [a.id, a]))
const toRecord = (entries: { cluster: SessionView; agents: AgentView[] }[]): Record<string, ClusterEntry> =>
  Object.fromEntries(entries.map((e) => [e.cluster.id, { cluster: e.cluster, agents: byId(e.agents) }]))

/** The selection survives only while its cluster exists. */
function keepSelection(state: ClustersState, clusters: Record<string, ClusterEntry>): string | null {
  return state.selectedId !== null && state.selectedId in clusters ? state.selectedId : null
}

export function clustersReducer(state: ClustersState, action: ClustersAction): ClustersState {
  switch (action.type) {
    case 'loaded': {
      // The stream may already have delivered fresher data: only fill in what it has not.
      const loaded = toRecord(action.entries.map((e) => ({ cluster: e.cluster, agents: Object.values(e.agents) })))
      const clusters = state.loaded ? state.clusters : { ...loaded, ...state.clusters }
      return { ...state, clusters, loaded: true, error: null, selectedId: keepSelection(state, clusters) }
    }
    case 'failed':
      return { ...state, error: action.message, loaded: true }
    case 'snapshot': {
      const clusters = toRecord(action.sessions.map((e) => ({ cluster: e.session, agents: e.agents })))
      return { ...state, clusters, loaded: true, error: null, selectedId: keepSelection(state, clusters) }
    }
    case 'session_status': {
      const prev = state.clusters[action.session.id]
      return { ...state, clusters: { ...state.clusters, [action.session.id]: { cluster: action.session, agents: prev?.agents ?? {} } } }
    }
    case 'agent_status': {
      const prev = state.clusters[action.sessionId]
      if (!prev) return state
      return { ...state, clusters: { ...state.clusters, [action.sessionId]: { ...prev, agents: { ...prev.agents, [action.agent.id]: action.agent } } } }
    }
    case 'leader_changed': {
      const prev = state.clusters[action.sessionId]
      if (!prev) return state
      const agents = Object.fromEntries(Object.entries(prev.agents).map(([id, a]) => [id, { ...a, leader: id === action.agentId }]))
      const cluster = { ...prev.cluster, leader_agent_id: action.agentId, leader_epoch: action.epoch }
      return { ...state, clusters: { ...state.clusters, [action.sessionId]: { cluster, agents } } }
    }
    case 'message_status': {
      const prev = state.clusters[action.sessionId]
      if (!prev) return state
      const summary = { ...prev.cluster.summary, queued: action.queued, failed: action.failed }
      return { ...state, clusters: { ...state.clusters, [action.sessionId]: { ...prev, cluster: { ...prev.cluster, summary } } } }
    }
    case 'session_removed': {
      if (!(action.sessionId in state.clusters)) return state
      const clusters = { ...state.clusters }
      delete clusters[action.sessionId]
      return { ...state, clusters, selectedId: keepSelection(state, clusters) }
    }
    case 'select':
      return { ...state, selectedId: action.id }
  }
}

/** Clusters ordered by slug. */
export const sortedClusters = (state: ClustersState): ClusterEntry[] =>
  Object.values(state.clusters).sort((a, b) => a.cluster.slug.localeCompare(b.cluster.slug))

/** Live agents of a cluster ordered by ordinal; agents whose pod is gone are hidden. */
export const sortedAgents = (entry: ClusterEntry): AgentView[] =>
  Object.values(entry.agents)
    .filter((a) => !a.gone)
    .sort((a, b) => a.ordinal - b.ordinal)

export function useClusters() {
  const [state, dispatch] = useReducer(clustersReducer, initialState)

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
      .then((clusters) => Promise.all(clusters.map(async (cluster) => ({ cluster, agents: byId(await listAgents(cluster.id)) }))))
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
  return { state, clusters: sortedClusters(state), select }
}
