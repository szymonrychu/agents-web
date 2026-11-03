/** Session level status derived from what /api/v1/stream already pushes: the mark state and the preparing/discarding progress. */
import type { AgentView, SessionView } from '../api/client'
import { humanizeSeconds } from '../sessions/sessionSpecForm'
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
  kind: 'closing' | 'bootstrap_failure' | 'permission_unavailable' | 'attention' | 'quiet'
  text: string
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
const live = (agents: readonly AgentView[]): AgentView[] => agents.filter((a) => !a.gone)

/** `HH:MMZ` (UTC) of an ISO timestamp, null when absent or unparsable. */
export function utcClock(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

/** The pending close of a session as text: `closing for inactivity, by 14:05Z` or `closing when idle: reason`. */
function closingText(session: SessionView): string {
  if (session.close_kind === 'inactivity') {
    const at = utcClock(session.close_deadline_at)
    return at === null ? 'closing for inactivity' : `closing for inactivity, by ${at}`
  }
  return session.close_reason ? `closing when idle: ${session.close_reason}` : 'closing when idle'
}

/** Set once the orchestrator has sent the inactivity reminder and nothing has happened since: how long the session was quiet when it was reminded. */
function quietReminded(session: SessionView): string | null {
  const reminded = session.inactivity_reminded_at ? Date.parse(session.inactivity_reminded_at) : NaN
  const updated = session.last_update_at ? Date.parse(session.last_update_at) : NaN
  if (!Number.isFinite(reminded) || !Number.isFinite(updated) || reminded < updated) return null
  return `quiet for ${humanizeSeconds(Math.round((reminded - updated) / 1000))}, reminder sent`
}

/** What needs a person on one agent: a failed bootstrap step ("install_plugins failed: ..."), an unavailable permission mode or the attention reason. */
export function agentIssue(a: AgentView): Issue | null {
  const f = a.bootstrap_failure
  if (f) return { kind: 'bootstrap_failure', text: f.message ? `${f.step} failed: ${f.message}` : `${f.step} failed` }
  if (a.permission_mode_state === 'unavailable') return { kind: 'permission_unavailable', text: a.permission_mode_reason ? `Auto mode unavailable: ${a.permission_mode_reason}` : 'Auto mode unavailable' }
  if (a.attention) return { kind: 'attention', text: `waiting: ${a.attention.reason}` }
  return null
}

/** The most urgent issue of a session: a pending self-close first (the session is about to go), then a bootstrap failure, then an unavailable permission mode, then attention, then the quiet line after an inactivity reminder; agent detail first, summary counts as fallback. */
export function sessionIssue(session: SessionView, agents: readonly AgentView[]): Issue | null {
  if (session.desired === 'active' && session.close_requested_at) return { kind: 'closing', text: closingText(session) }
  const issues = live(agents).map(agentIssue)
  const failure = issues.find((i) => i?.kind === 'bootstrap_failure')
  if (failure) return failure
  const failed = session.summary.bootstrap_failed_agents ?? 0
  if (failed > 0) return { kind: 'bootstrap_failure', text: `${plural(failed, 'agent', 'agents')} failed to bootstrap` }
  const unavailable = issues.find((i) => i?.kind === 'permission_unavailable')
  if (unavailable) return unavailable
  const unavailableCount = session.summary.permission_unavailable_agents ?? 0
  if (unavailableCount > 0) return { kind: 'permission_unavailable', text: `Auto mode unavailable on ${plural(unavailableCount, 'agent', 'agents')}` }
  const attention = issues.find((i) => i?.kind === 'attention')
  if (attention) return attention
  const waiting = session.summary.attention_agents ?? 0
  if (waiting > 0) return { kind: 'attention', text: `${plural(waiting, 'agent', 'agents')} waiting for input` }
  const quiet = quietReminded(session)
  return quiet === null ? null : { kind: 'quiet', text: quiet }
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
