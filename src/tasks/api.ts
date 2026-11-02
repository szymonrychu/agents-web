/** Typed access to the taskboard web API, over the `taskboard` backend's base path. */
import { requestAt } from '../api/client'
import { backendBase } from '../config/backends'
import type { components } from '../api/taskboard-schema'

type S = components['schemas']
// The generated types mark defaulted fields required; a request may leave them out.
export type TaskCreate = Partial<S['TaskCreate']> & { title: string }
export type TaskPatch = Partial<S['TaskPatch']> & { version: number }
export type TodoItemIn = Partial<S['TodoItemIn']> & { text: string }
export type TodoPatch = S['TodoPatch']

export type TaskStatus = 'idea' | 'open' | 'in_progress' | 'done' | 'dropped'
export type ListStatus = 'active' | 'done' | 'dropped' | 'all'
export type TodoStatus = 'todo' | 'inprogress' | 'done'

// The server documents task responses as free-form objects; these mirror `load_tasks` in agents-taskboard.
export interface TodoItem {
  id: number
  text: string
  status: TodoStatus
  position: number
}
export interface DecisionOption {
  label: string
  description?: string | null
  recommended?: boolean
}
export interface Decision {
  id: number
  asking_session: string
  asking_slug: string | null
  question: string
  context: string
  options: DecisionOption[]
  status: 'open' | 'answered' | 'withdrawn'
  /** `{choice, label}` or `{text}` once answered. */
  answer: { choice?: number; label?: string; text?: string } | null
  note: string | null
  created_at: string
  answered_at: string | null
}
export interface Comment {
  id: number
  author_kind: string
  author_session: string | null
  author_slug: string | null
  body: string
  created_at: string
}
export interface TaskEvent {
  id: number
  actor_kind: string
  actor_session: string | null
  actor_slug: string | null
  kind: string
  detail: Record<string, unknown> | null
  at: string
}
export interface WaitingSession {
  session_id: string
  slug: string | null
}
export interface Task {
  key: string
  title: string
  body: string
  kind: 'idea' | 'task'
  status: TaskStatus
  labels: string[]
  assignee_session: string | null
  blocked: boolean
  open_decisions: number
  waiting_sessions: WaitingSession[]
  todo: TodoItem[]
  decisions: Decision[]
  comments: Comment[]
  events: TaskEvent[]
  url: string
  version: number
  created_at: string
  updated_at: string
}
export interface TaskPage {
  items: Task[]
  next_cursor: string | null
}

const id = encodeURIComponent
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('taskboard'), method, path, body)

export interface ListQuery {
  status?: ListStatus
  session?: string
  labels?: string[]
  cursor?: string
  limit?: number
}
export function listTasks(opts: ListQuery = {}): Promise<TaskPage> {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  if (opts.session) q.set('session', opts.session)
  for (const l of opts.labels ?? []) q.append('label', l)
  if (opts.cursor) q.set('cursor', opts.cursor)
  if (opts.limit) q.set('limit', String(opts.limit))
  const s = q.toString()
  return req<TaskPage>('GET', `/tasks${s ? `?${s}` : ''}`)
}
export const getTask = (key: string) => req<Task>('GET', `/tasks/${id(key)}`)
export const createTask = (body: TaskCreate) => req<Task>('POST', '/tasks', body)
export const patchTask = (key: string, body: TaskPatch) => req<Task>('PATCH', `/tasks/${id(key)}`, body)
export const addComment = (key: string, body: string) => req<Task>('POST', `/tasks/${id(key)}/comments`, { body })
/** Exactly one of `choice` (option index) or `text`, plus an optional note. */
export type AnswerIn = { choice: number; note?: string } | { text: string; note?: string }
export const answerDecision = (key: string, decisionId: number, body: AnswerIn) =>
  req<Decision>('POST', `/tasks/${id(key)}/decisions/${decisionId}/answer`, body)
export const replaceTodo = (key: string, items: TodoItemIn[]) => req<Task>('PUT', `/tasks/${id(key)}/todo`, { items })
export const patchTodoItem = (key: string, itemId: number, body: TodoPatch) => req<Task>('PATCH', `/tasks/${id(key)}/todo/${itemId}`, body)

export const taskStreamUrl = () => `${backendBase('taskboard')}/stream`
