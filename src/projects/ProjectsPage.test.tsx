// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { Project } from './api'
import { MemoryRouter } from 'react-router'
import { ProjectProvider, useProject } from './ProjectContext'
import { ProjectsPage } from './ProjectsPage'

const api = vi.hoisted(() => ({ listProjects: vi.fn(), createProject: vi.fn(), patchProject: vi.fn(), projectsSummary: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const project = (slug: string, over: Partial<Project> = {}): Project => ({
  slug, name: `Name ${slug}`, description: `About ${slug}`, archived: false, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', presets: 3, sessions: 5, ...over,
})
function Selector() {
  return <div data-testid="selector">{useProject().projects.map((p) => p.slug).join(',')}</div>
}
const mount = () => render(<MemoryRouter><ProjectProvider><ThemeProvider theme={theme}><Selector /><ProjectsPage onBack={() => {}} /></ThemeProvider></ProjectProvider></MemoryRouter>)

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.listProjects.mockResolvedValue([project('default'), project('alpha', { presets: 1, sessions: 2 })])
  api.projectsSummary.mockResolvedValue([{ project: 'alpha', open_tasks: 7, waiting_decisions: 4 }])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProjectsPage', () => {
  test('lists projects with counts and taskboard summary', async () => {
    mount()
    const row = (await screen.findByText('Name alpha')).closest('tr')!
    await waitFor(() => expect(within(row).getByText('7')).toBeTruthy())
    expect(within(row).getByText('1')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy()
    expect(within(row).getByText('4')).toBeTruthy()
  })

  test('create dialog validates the slug pattern', async () => {
    api.createProject.mockResolvedValue(project('beta'))
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Slug'), '-bad')
    await user.type(within(dialog).getByLabelText('Name'), 'Beta')
    expect(within(dialog).getByText(/lowercase letters, digits and dashes/)).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    await user.clear(within(dialog).getByLabelText('Slug'))
    await user.type(within(dialog).getByLabelText('Slug'), 'beta-1')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({ slug: 'beta-1', name: 'Beta', description: '' }))
  })

  test('creating a project refreshes the shared project list', async () => {
    api.createProject.mockResolvedValue(project('beta'))
    const user = userEvent.setup()
    mount()
    await waitFor(() => expect(screen.getByTestId('selector').textContent).toBe('default,alpha'))
    api.listProjects.mockResolvedValue([project('default'), project('alpha'), project('beta')])
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Slug'), 'beta')
    await user.type(within(dialog).getByLabelText('Name'), 'Beta')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByTestId('selector').textContent).toBe('default,alpha,beta'))
  })

  test('archived-only switch lists archived projects and Restore unarchives', async () => {
    api.patchProject.mockResolvedValue(project('old'))
    const user = userEvent.setup()
    mount()
    await screen.findByText('Name alpha')
    api.listProjects.mockResolvedValue([project('old', { archived: true })])
    await user.click(screen.getByLabelText('Archived only'))
    await waitFor(() => expect(api.listProjects).toHaveBeenLastCalledWith(true))
    const row = (await screen.findByText('Name old')).closest('tr')!
    expect(screen.queryByText('Name alpha')).toBeNull()
    await user.click(within(row).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(api.patchProject).toHaveBeenCalledWith('old', { archived: false }))
  })

  test('edit changes name and description, slug is fixed', async () => {
    api.patchProject.mockResolvedValue(project('alpha'))
    const user = userEvent.setup()
    mount()
    const row = (await screen.findByText('Name alpha')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Slug') as HTMLInputElement).disabled).toBe(true)
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Renamed')
    await user.clear(within(dialog).getByLabelText('Description'))
    await user.type(within(dialog).getByLabelText('Description'), 'New text')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchProject).toHaveBeenCalledWith('alpha', { name: 'Renamed', description: 'New text' }))
  })

  test('archive asks for confirmation and is disabled for default', async () => {
    api.patchProject.mockResolvedValue(project('alpha', { archived: true }))
    const user = userEvent.setup()
    mount()
    const def = (await screen.findByText('Name default')).closest('tr')!
    expect((within(def).getByRole('button', { name: 'Archive' }) as HTMLButtonElement).disabled).toBe(true)
    const row = screen.getByText('Name alpha').closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Archive' }))
    expect(api.patchProject).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.patchProject).toHaveBeenCalledWith('alpha', { archived: true }))
  })

  test('409 and 422 answers show the error code', async () => {
    api.createProject.mockRejectedValueOnce(new ApiError(409, 'project_exists', 'project exists'))
    api.patchProject.mockRejectedValueOnce(new ApiError(422, 'project_archived', 'project is archived'))
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Slug'), 'alpha')
    await user.type(within(dialog).getByLabelText('Name'), 'Alpha')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await within(dialog).findByText(/project_exists/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const row = screen.getByText('Name alpha').closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Archive' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText(/project_archived/)).toBeTruthy()
  })
})
