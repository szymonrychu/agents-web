// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Project } from './api'
import { ProjectProvider, useProject } from './ProjectContext'

const api = vi.hoisted(() => ({ listProjects: vi.fn() }))
vi.mock('./api', () => api)

const proj = (slug: string, archived = false) => ({ slug, name: slug.toUpperCase(), description: '', archived, created_at: '', updated_at: '', presets: null, sessions: null }) as Project

const seen = {} as { ctx: ReturnType<typeof useProject> }
function Probe() {
  const state = useProject()
  useEffect(() => { seen.ctx = state })
  return <div>{`project=${state.project ?? 'all'};n=${state.projects.length}`}</div>
}
const mount = (url = '/', children: ReactNode = <Probe />) =>
  render(<MemoryRouter initialEntries={[url]}><ProjectProvider>{children}</ProjectProvider></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  api.listProjects.mockReset()
  api.listProjects.mockResolvedValue([proj('default'), proj('old', true), proj('web')])
})
afterEach(cleanup)

describe('ProjectProvider', () => {
  test('defaults to all projects and lists active projects only', async () => {
    mount()
    await waitFor(() => expect(screen.getByText('project=all;n=2')).toBeTruthy())
    await waitFor(() => expect(seen.ctx.projects.map((p) => p.slug)).toEqual(['default', 'web']))
  })

  test('persists selection in storage', async () => {
    mount()
    await waitFor(() => expect(seen.ctx.projects.length).toBe(2))
    act(() => seen.ctx.setProject('web'))
    expect(screen.getByText('project=web;n=2')).toBeTruthy()
    expect(localStorage.getItem('orch:project')).toBe('"web"')
    cleanup()
    mount()
    expect(screen.getByText(/project=web/)).toBeTruthy()
    act(() => seen.ctx.setProject(null))
    expect(localStorage.getItem('orch:project')).toBe('null')
  })

  test('url param overrides storage', async () => {
    localStorage.setItem('orch:project', '"web"')
    mount('/tasks?project=default')
    expect(screen.getByText(/project=default/)).toBeTruthy()
    act(() => seen.ctx.setProject('web'))
    expect(screen.getByText(/project=web/)).toBeTruthy()
  })

  test('storage failure falls back to all', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mount()
    expect(screen.getByText(/project=all/)).toBeTruthy()
    act(() => seen.ctx.setProject('web'))
    expect(screen.getByText(/project=web/)).toBeTruthy()
    spy.mockRestore()
    set.mockRestore()
  })

  test('a failing project list leaves the list empty', async () => {
    api.listProjects.mockRejectedValue(new Error('down'))
    mount()
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled())
    expect(screen.getByText('project=all;n=0')).toBeTruthy()
  })
})

describe('ProjectProvider refresh', () => {
  test('reloads the project list when the window regains focus and when the selection changes', async () => {
    mount()
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(1))
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(2))
    act(() => seen.ctx.setProject('web'))
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(3))
  })
})
