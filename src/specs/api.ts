/** Typed access to the taskboard specs API, over the `taskboard` backend's base path. */
import { requestAt } from '../api/client'
import { backendBase } from '../config/backends'
import type { components } from '../api/taskboard-schema'

type S = components['schemas']
// The generated types mark defaulted fields required; a request may leave them out.
export type SpecPatch = Partial<S['SpecPatch']> & { version: number }
export type SpecCommentCreate = Partial<S['SpecCommentCreate']> & { body: string }

export type SpecStatus = 'draft' | 'review' | 'approved' | 'archived'

// The server documents spec responses as free-form objects; these mirror `db/specs.py` in agents-taskboard v0.6.0.
export interface Actor {
  kind: string
  session: string | null
  slug: string | null
}
export interface DocVersion {
  path: string
  version: number
  sha256: string
  size: number
  note: string | null
  sources: Record<string, unknown>[]
  created_by: Actor | null
  created_at: string
  /** Only in version listings: the version removed the document. */
  removed?: boolean
}
export interface DocBody extends DocVersion {
  body: string
}
export interface Spec {
  key: string
  project: string
  name: string
  title: string
  status: SpecStatus
  labels: string[]
  assignee_session: string | null
  assignee_slug: string | null
  created_by: Actor | null
  version: number
  created_at: string
  updated_at: string
  /** Only on a single spec, not in lists. */
  documents?: DocVersion[]
  tasks?: string[]
  open_comments?: number
}
export interface SpecPage {
  items: Spec[]
  next_cursor: string | null
}
export interface VersionPage {
  items: DocVersion[]
  next_cursor: number | null
}
export interface SpecComment {
  id: number
  path: string | null
  version: number | null
  anchor: string | null
  body: string
  suggestion: string | null
  suggestion_status: 'open' | 'accepted' | 'dismissed' | null
  accepted_version: number | null
  decided_at: string | null
  decided_by: Actor | null
  attachments: Record<string, unknown>[]
  resolved_at: string | null
  resolved_by: Actor | null
  created_by: Actor | null
  created_at: string
}

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
export const listDocs = (key: string) => req<{ items: DocVersion[] }>('GET', `/specs/${id(key)}/docs`)
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
  return req<{ items: SpecComment[] }>('GET', `/specs/${id(key)}/comments${s ? `?${s}` : ''}`)
}
export const createComment = (key: string, body: SpecCommentCreate) => req<SpecComment>('POST', `/specs/${id(key)}/comments`, body)
export const resolveComment = (key: string, commentId: number) => req<SpecComment>('POST', `/specs/${id(key)}/comments/${commentId}/resolve`)
/** `version` is the document version the user last saw; a 412 `stale_version` carries `current_version`. */
export const acceptSuggestion = (key: string, commentId: number, version: number) =>
  req<{ version: number; comment: SpecComment }>('POST', `/specs/${id(key)}/comments/${commentId}/accept`, { version })
export const dismissSuggestion = (key: string, commentId: number) => req<SpecComment>('POST', `/specs/${id(key)}/comments/${commentId}/dismiss`)

export const specStreamUrl = () => `${backendBase('taskboard')}/stream`
