/** Spec autostart: the per-project limits and the start queue of the taskboard (`/specs/queue`, `/projects/{slug}/autostart`). */
import { requestAt } from '../api/client'
import { backendBase, isConfigured } from '../config/backends'
import type { components } from '../api/taskboard-schema'

type S = components['schemas']
export type ProjectQueue = S['ProjectQueue']
export type AutostartView = S['AutostartView']
export type QueueItem = S['QueueItem']
export type AutostartState = ProjectQueue['state']
export interface AutostartLimits {
  max_active_sessions: number | null
  max_usage_pct: number | null
}

const id = encodeURIComponent
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('taskboard'), method, path, body)

export const STATE_TEXT: Record<AutostartState, string> = {
  off: 'autostart off - set limits',
  usage_unknown: 'usage unknown',
  at_limit: 'at session limit',
  usage_high: 'usage above limit',
  usage_refused: 'usage refused by orchestrator, retrying',
  orchestrator_unavailable: 'orchestrator unavailable, retrying',
  ready: 'autostart on',
  idle: 'autostart on - queue empty',
}

/** Every visible project's queue, or one project's; empty when the taskboard backend is not configured. */
export async function listSpecQueue(project?: string): Promise<ProjectQueue[]> {
  if (!isConfigured('taskboard')) return []
  const q = project ? `?project=${id(project)}` : ''
  return (await req<S['SpecQueue']>('GET', `/specs/queue${q}`)).projects
}

/** `position` is the 1-based rank (the API's dense rank), `before` a queued start id. */
export const moveQueued = (startId: number, to: { position: number } | { before: number }) =>
  req<ProjectQueue>('POST', `/specs/queue/${startId}/move`, to)

export const removeQueued = (startId: number) => req<void>('DELETE', `/specs/queue/${startId}`)

export const getAutostart = (slug: string) => req<AutostartView>('GET', `/projects/${id(slug)}/autostart`)

/** Both keys are sent; null unsets a limit. */
export const putAutostart = (slug: string, body: AutostartLimits) => req<AutostartView>('PUT', `/projects/${id(slug)}/autostart`, body)
