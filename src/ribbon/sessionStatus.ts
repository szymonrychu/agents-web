/** Session level status derived from what /api/v1/stream already pushes: the mark state and the preparing/discarding progress. */
import type { AgentView, SessionView } from '../api/client'
import { agentMark } from './stateMark'
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

export interface Issue {
  kind: 'bootstrap_failure' | 'attention'
  text: string
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const live = (agents: readonly AgentView[]): AgentView[] => agents.filter((a) => !a.gone)

/** What needs a person on one agent: a failed bootstrap step ("install_plugins failed: ...") or the attention reason. */
export function agentIssue(a: AgentView): Issue | null {
  const f = a.bootstrap_failure
  if (f) return { kind: 'bootstrap_failure', text: f.message ? `${f.step} failed: ${f.message}` : `${f.step} failed` }
  if (a.attention) return { kind: 'attention', text: `waiting: ${a.attention.reason}` }
  return null
}

/** The most urgent issue of a session: a bootstrap failure first, then attention; agent detail first, summary counts as fallback. */
export function sessionIssue(session: SessionView, agents: readonly AgentView[]): Issue | null {
  const issues = live(agents).map(agentIssue)
  const failure = issues.find((i) => i?.kind === 'bootstrap_failure')
  if (failure) return failure
  const failed = session.summary.bootstrap_failed_agents ?? 0
  if (failed > 0) return { kind: 'bootstrap_failure', text: `${plural(failed, 'agent', 'agents')} failed to bootstrap` }
  const attention = issues.find((i) => i?.kind === 'attention')
  if (attention) return attention
  const waiting = session.summary.attention_agents ?? 0
  return waiting > 0 ? { kind: 'attention', text: `${plural(waiting, 'agent', 'agents')} waiting for input` } : null
}

/** The bootstrap step an agent is running now, for the preparing label. */
const runningStep = (agents: readonly AgentView[]): string | null => live(agents).find((a) => a.bootstrap?.status === 'running')?.bootstrap?.step ?? null

/** Progress of a session being prepared (gates running, pods not ready) or discarded; null otherwise. */
export function preparingProgress(session: SessionView, agents: readonly AgentView[] = []): Progress | null {
  const status = obj(session.status)
  const message = typeof status.message === 'string' && status.message !== '' ? status.message : null
  if (session.desired === 'deleting') return { kind: 'discarding', label: message ?? 'discarding', value: null }
  const gate = runningGate(status)
  if (gate === null && status.phase !== 'pending') return null
  const step = runningStep(agents)
  const withStep = (label: string): string => (step === null ? label : `${label}, bootstrap: ${step}`)
  if (gate !== null) return { kind: 'preparing', label: withStep(message ?? gate), value: null }
  const { ready, replicas } = session.summary
  const value = replicas > 0 ? Math.round((ready / replicas) * 100) : null
  return { kind: 'preparing', label: withStep(message ?? `${ready} of ${replicas} agents ready`), value }
}

/**
 * Mark state of a session. Precedence: discarded > deleting > error > attention (an agent waiting for input)
 * > working > booting > idle. summary.state 'waiting' means every agent is idle, not waiting for input.
 */
export function sessionMarkState(session: SessionView, agents: readonly AgentView[], discarded = false): MarkState {
  if (discarded) return 'discarded'
  const summary = session.summary.state
  if (session.desired === 'deleting' || summary === 'deleting') return 'deleting'
  if (summary === 'error' || (session.summary.bootstrap_failed_agents ?? 0) > 0 || live(agents).some((a) => a.bootstrap_failure)) return 'error'
  if ((session.summary.attention_agents ?? 0) > 0 || live(agents).some((a) => agentMark(a) === 'attention')) return 'attention'
  const base: MarkState = summary === 'working' ? 'working' : summary === 'booting' ? 'booting' : 'idle'
  return base !== 'booting' && preparingProgress(session, agents) !== null ? 'booting' : base
}
