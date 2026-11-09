/** The selected project: `null` is "All projects". Persisted (`orch:project`); a `?project=` URL param overrides it. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { loadJson, saveJson } from '../layout/storage'
import { listProjects } from './api'
import type { Project } from './api'

export interface ProjectState {
  project: string | null
  setProject: (project: string | null) => void
  projects: Project[]
}

const ProjectContext = createContext<ProjectState>({ project: null, setProject: () => {}, projects: [] })

export const useProject = () => useContext(ProjectContext)

const isSlug = (v: unknown): v is string | null => v === null || typeof v === 'string'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const [stored, setStored] = useState<string | null>(() => loadJson<string | null>('project', null, isSlug))
  const [projects, setProjects] = useState<Project[]>([])
  useEffect(() => {
    let live = true
    listProjects().then(
      (list) => { if (live) setProjects(list.filter((p) => !p.archived)) },
      () => { if (live) setProjects([]) },
    )
    return () => { live = false }
  }, [])
  const fromUrl = params.get('project') || null
  const setProject = useCallback((next: string | null) => {
    setStored(next)
    saveJson('project', next)
    setParams((prev) => {
      if (!prev.has('project')) return prev
      const copy = new URLSearchParams(prev)
      copy.delete('project')
      return copy
    }, { replace: true })
  }, [setParams])
  const value = useMemo(() => ({ project: fromUrl ?? stored, setProject, projects }), [fromUrl, stored, setProject, projects])
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
