/** Session level status derived from what /api/v1/stream already pushes: the mark state and the preparing/discarding progress. */
import type { AgentView, SessionView } from '../api/client'
import { agentMarkState } from './stateMark'
import type { MarkState } from './stateMark'

export interface Progress {
  kind: 'preparing' | 'discarding'
  label: string
  /** 0-100 when the fraction is known, null for an indeterminate bar. */
  value: number | null
}

type Dict = Record<string, unknown>
const obj = (v: unknown): Dict => (typeof v === 'object' && v !== null ? (v as Dict) : {})
const running = (v: unknown): boolean => obj(v).state === 'running'

/** The first gate (sessions restore, cache restore, init) still running, as the text the reconciler uses. */
function runningGate(status: Dict): string | null {
  const cache = obj(status.cache)
  if (running(cache.sessions_restore)) return 'sessions restore running'
  if (running(cache.restore)) return 'cache restore running'
  if (running(status.init)) return 'init running'
  return null
}

/** Progress of a session being prepared (gates running, pods not ready) or discarded; null otherwise. */
export function preparingProgress(session: SessionView): Progress | null {
  const status = obj(session.status)
  const message = typeof status.message === 'string' && status.message !== '' ? status.message : null
  if (session.desired === 'deleting') return { kind: 'discarding', label: message ?? 'discarding', value: null }
  const gate = runningGate(status)
  if (gate === null && status.phase !== 'pending') return null
  if (gate !== null) return { kind: 'preparing', label: message ?? gate, value: null }
  const { ready, replicas } = session.summary
  const value = replicas > 0 ? Math.round((ready / replicas) * 100) : null
  return { kind: 'preparing', label: message ?? `${ready} of ${replicas} agents ready`, value }
}

/**
 * Mark state of a session. Precedence: discarded > deleting > error > attention (an agent waiting for input)
 * > working > booting > idle. summary.state 'waiting' means every agent is idle, not waiting for input.
 */
export function sessionMarkState(session: SessionView, agents: readonly AgentView[], discarded = false): MarkState {
  if (discarded) return 'discarded'
  const summary = session.summary.state
  if (session.desired === 'deleting' || summary === 'deleting') return 'deleting'
  if (summary === 'error') return 'error'
  if (agents.some((a) => !a.gone && agentMarkState(a.state, a.ready) === 'attention')) return 'attention'
  const base: MarkState = summary === 'working' ? 'working' : summary === 'booting' ? 'booting' : 'idle'
  return base !== 'booting' && preparingProgress(session) !== null ? 'booting' : base
}
