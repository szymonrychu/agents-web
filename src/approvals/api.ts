/** Typed access to the taskboard approvals API, over the `taskboard` backend's base path. */
import { requestAt } from '../api/client'
import { backendBase } from '../config/backends'
import type { Decision } from '../tasks/api'

export type Verdict = 'go' | 'no_go'
export type ApprovalResult = 'answered' | 'already_answered' | 'expired' | 'withdrawn' | 'not_found'
export interface Approval extends Decision {
  task_key: string
  url: string
  task_title: string
  project: string
}
export interface ApprovalQuery {
  status?: 'open' | 'answered' | 'withdrawn' | 'expired' | 'all'
  session?: string
  project?: string | null
}
export interface ApprovalAnswer {
  id: number
  verdict: Verdict
  note?: string
}

const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('taskboard'), method, path, body)

export function listApprovals(opts: ApprovalQuery = {}): Promise<{ items: Approval[] }> {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  if (opts.session) q.set('session', opts.session)
  if (opts.project) q.set('project', opts.project)
  const s = q.toString()
  return req('GET', `/approvals${s ? `?${s}` : ''}`)
}

export const answerApprovals = (items: ApprovalAnswer[]) =>
  req<{ items: { id: number; result: ApprovalResult; task_key: string | null }[] }>('POST', '/approvals/answer', { items })

/** Time left until `expiresAt` as "Expires in 2 d 5 h", or "Expired" once it passed. */
export function expiresIn(expiresAt: string, now: Date): string {
  const ms = new Date(expiresAt).getTime() - now.getTime()
  if (!(ms > 0)) return 'Expired'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'Expires in <1m'
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `Expires in ${d} d ${h} h`
  if (h > 0) return `Expires in ${h} h ${m} min`
  return `Expires in ${m} min`
}
