/** Typed access to the taskboard specs API, over the `taskboard` backend's base path. */
import { requestAt } from '../api/client'
import { backendBase } from '../config/backends'
import type { components } from '../api/taskboard-schema'
import type { Task, TaskPatch } from '../tasks/api'

type S = components['schemas']
// The generated types mark defaulted fields required; a request may leave them out.
export type SpecPatch = Partial<S['SpecPatch']> & { version: number }
export type SpecCommentCreate = Partial<S['SpecCommentCreate']> & { body: string }

export type SpecStatus = 'draft' | 'review' | 'approved' | 'archived'

export type Actor = S['ActorRef']
export type DocVersion = S['DocumentVersionListed']
export type DocBody = S['DocumentBody']
export type Spec = S['SpecDetail']
export type SpecDocument = S['SpecDocument']
export type SpecSummary = S['SpecSummary']
export type SpecPage = S['SpecPage']
export type VersionPage = S['VersionPage']
export type SpecComment = S['SpecComment']
export type Plan = S['Plan']
export type Step = S['Step']
export type Gate = S['Gate']

const id = encodeURIComponent
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('taskboard'), method, path, body)
const docUrl = (key: string, path: string) => `/specs/${id(key)}/docs/${path.split('/').map(id).join('/')}`

export interface SpecListQuery {
  project?: string | null
  status?: SpecStatus
  labels?: string[]
  name?: string
  cursor?: string
  limit?: number
}
export function listSpecs(opts: SpecListQuery = {}): Promise<SpecPage> {
  const q = new URLSearchParams()
  if (opts.project) q.set('project', opts.project)
  if (opts.status) q.set('status', opts.status)
  for (const l of opts.labels ?? []) q.append('label', l)
  if (opts.name) q.set('name', opts.name)
  if (opts.cursor) q.set('cursor', opts.cursor)
  if (opts.limit) q.set('limit', String(opts.limit))
  const s = q.toString()
  return req<SpecPage>('GET', `/specs${s ? `?${s}` : ''}`)
}
export const getSpec = (key: string) => req<Spec>('GET', `/specs/${id(key)}`)
export const patchSpec = (key: string, body: SpecPatch) => req<Spec>('PATCH', `/specs/${id(key)}`, body)
export const deleteSpec = (key: string) => req<void>('DELETE', `/specs/${id(key)}`)
export const listDocs = (key: string) => req<S['DocumentList']>('GET', `/specs/${id(key)}/docs`)
export const getDoc = (key: string, path: string, version?: number) =>
  req<DocBody>('GET', `${docUrl(key, path)}${version === undefined ? '' : `?version=${version}`}`)
export function listVersions(key: string, path: string, opts: { limit?: number; cursor?: number } = {}): Promise<VersionPage> {
  const q = new URLSearchParams()
  if (opts.limit) q.set('limit', String(opts.limit))
  if (opts.cursor !== undefined) q.set('cursor', String(opts.cursor))
  const s = q.toString()
  return req<VersionPage>('GET', `${docUrl(key, path)}/versions${s ? `?${s}` : ''}`)
}
export const listComments = (key: string, opts: { path?: string; open?: boolean } = {}) => {
  const q = new URLSearchParams()
  if (opts.path) q.set('path', opts.path)
  if (opts.open !== undefined) q.set('open', String(opts.open))
  const s = q.toString()
  return req<S['CommentList']>('GET', `/specs/${id(key)}/comments${s ? `?${s}` : ''}`)
}
export const createComment = (key: string, body: SpecCommentCreate) => req<SpecComment>('POST', `/specs/${id(key)}/comments`, body)
export const resolveComment = (key: string, commentId: number) => req<SpecComment>('POST', `/specs/${id(key)}/comments/${commentId}/resolve`)
/** `version` is the document version the user last saw; a 412 `stale_version` carries `current_version`. */
export const acceptSuggestion = (key: string, commentId: number, version: number) =>
  req<S['SuggestionAccepted']>('POST', `/specs/${id(key)}/comments/${commentId}/accept`, { version })
export const dismissSuggestion = (key: string, commentId: number) => req<SpecComment>('POST', `/specs/${id(key)}/comments/${commentId}/dismiss`)

export const getPlan = (key: string) => req<Plan>('GET', `/specs/${id(key)}/plan`)
/** `version` is the header version last read; a 412 `stale_version` carries `current_version`. */
export type PlanPut = Partial<S['PlanPut']> & { version: number }
export const putPlan = (key: string, body: PlanPut) => req<Plan>('PUT', `/specs/${id(key)}/plan`, body)
export const listSteps = (key: string) => req<S['StepList']>('GET', `/specs/${id(key)}/steps`)
export const getGate = (key: string) => req<Gate>('GET', `/specs/${id(key)}/gate`)

/** The body of `POST /specs/{key}/steps`; `after` 0 puts the step first, absent last. `steps_version` is the one last read. */
export type StepInsert = Partial<S['StepInsert']> & { steps_version: number; title: string }
export const insertStep = (key: string, body: StepInsert) => req<Step>('POST', `/specs/${id(key)}/steps`, body)
/** `order` is every step's task key in the new order. */
export const reorderSteps = (key: string, stepsVersion: number, order: string[]) =>
  req<S['StepsVersion']>('PUT', `/specs/${id(key)}/steps/order`, { steps_version: stepsVersion, order })
/** Steps are tasks: the editor reads and patches them as such. A 412 carries no extra field, the task `version` is the guard. */
export const getStepTask = (taskKey: string) => req<Task>('GET', `/tasks/${id(taskKey)}`)
export const patchStep = (taskKey: string, body: TaskPatch) => req<Task>('PATCH', `/tasks/${id(taskKey)}`, body)
/** Replaces the step's dependencies (task keys of steps of the same spec); 422 `dependency_cycle` when they form a cycle. */
export const setDeps = (taskKey: string, dependsOn: string[]) => req<Task>('PUT', `/tasks/${id(taskKey)}/deps`, { depends_on: dependsOn })

export const specStreamUrl = () => `${backendBase('taskboard')}/stream`
