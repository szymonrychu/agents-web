/** Projects on the orchestrator main port (/api/v1/projects). */
import { query, request, requestAt } from '../api/client'
import { backendBase, isConfigured } from '../config/backends'
import type { components } from '../api/schema'

type S = components['schemas']
export type Project = S['ProjectView']
export type ProjectIn = S['ProjectIn']
export type ProjectPatch = S['ProjectPatch']

const id = encodeURIComponent

/** Active projects by default; `archived` true also lists the archived ones. */
export const listProjects = (archived?: boolean) => request<Project[]>('GET', `/projects${query({ archived: archived === undefined ? undefined : String(archived) })}`)
export const getProject = (slug: string) => request<Project>('GET', `/projects/${id(slug)}`)
export const createProject = (body: ProjectIn) => request<Project>('POST', '/projects', body)
/** Slug is immutable; name, description and archived are editable. */
export const patchProject = (slug: string, body: ProjectPatch) => request<Project>('PATCH', `/projects/${id(slug)}`, body)

/** One row of the taskboard `GET /projects/summary` (the generated schema leaves it free-form). */
export interface ProjectSummary {
  project: string
  open_tasks: number
  waiting_decisions: number
  specs?: { draft?: number; review?: number; approved?: number }
}
/** Empty when the taskboard backend is not configured. */
export const projectsSummary = (): Promise<ProjectSummary[]> =>
  isConfigured('taskboard') ? requestAt<ProjectSummary[]>(backendBase('taskboard'), 'GET', '/projects/summary') : Promise.resolve([])
