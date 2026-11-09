// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { MoveProjectDialog } from './MoveProjectDialog'

const api = vi.hoisted(() => ({ moveSessionProject: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))
vi.mock('../projects/ProjectContext', () => ({
  useProject: () => ({ project: null, setProject: () => {}, projects: [{ slug: 'default', name: 'Default' }, { slug: 'infra', name: 'Infra' }] }),
}))

const session = { id: 'c1', slug: 'alpha', project: 'default' } as SessionView
const mount = (onMoved = vi.fn()) => render(<ThemeProvider theme={theme}><MoveProjectDialog open session={session} onClose={vi.fn()} onMoved={onMoved} /></ThemeProvider>)
const pick = async (name: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: 'Project' }))
  await userEvent.click(screen.getByRole('option', { name }))
}

// braces: a returned mock would be run by vitest as the teardown
beforeEach(() => { api.moveSessionProject.mockReset() })
afterEach(cleanup)

describe('MoveProjectDialog', () => {
  test('Move is disabled until another project is picked, then PATCHes it', async () => {
    api.moveSessionProject.mockResolvedValue({ ...session, project: 'infra' })
    const onMoved = vi.fn()
    mount(onMoved)
    expect((screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement).disabled).toBe(true)
    await pick('Infra')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onMoved).toHaveBeenCalled())
    expect(api.moveSessionProject).toHaveBeenCalledWith('c1', 'infra')
  })

  test('shows the 409 refusal', async () => {
    api.moveSessionProject.mockRejectedValue(new ApiError(409, 'conflict', 'session is closing'))
    const onMoved = vi.fn()
    mount(onMoved)
    await pick('Infra')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect((await screen.findByRole('alert')).textContent).toContain('session is closing')
    expect(onMoved).not.toHaveBeenCalled()
  })

  test('shows the 422 project_archived refusal', async () => {
    api.moveSessionProject.mockRejectedValue(new ApiError(422, 'project_archived', 'project "infra" is archived'))
    mount()
    await pick('Infra')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect((await screen.findByRole('alert')).textContent).toContain('project "infra" is archived')
  })
})
