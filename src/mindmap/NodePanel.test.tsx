// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { NodePanel } from './NodePanel'
import { edgeView, growth, nodeView } from './testUtils'

const api = vi.hoisted(() => ({ getNode: vi.fn(), patchNode: vi.fn(), patchGrowth: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const mount = (onChanged = vi.fn()) =>
  render(<ThemeProvider theme={theme}><NodePanel nodeKey="N-2" onChanged={onChanged} onDeleted={() => {}} onOpenNode={() => {}} /></ThemeProvider>)
const user = () => userEvent.setup()
const conflict = (current: number) => new ApiError(409, 'version_conflict', 'stale', { current_version: current })

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset()
  api.getNode.mockResolvedValue(nodeView())
  api.patchNode.mockResolvedValue(nodeView({ version: 4 }))
  api.patchGrowth.mockResolvedValue(growth())
})
afterEach(cleanup)

async function startEditing(u: ReturnType<typeof user>) {
  mount()
  await u.click(await screen.findByRole('button', { name: /Edit notes/ }))
  const notes = screen.getByLabelText('Notes')
  await u.clear(notes)
  await u.type(notes, 'New text')
}

describe('NodePanel', () => {
  test('renders notes through the markdown renderer', async () => {
    mount()
    const bold = await screen.findByText('bold')
    expect(bold.tagName).toBe('STRONG')
    expect(screen.getByRole('heading', { name: 'Findings' })).toBeTruthy()
  })

  test('saving needs a change summary and sends the row version', async () => {
    const u = user()
    await startEditing(u)
    const save = screen.getByRole('button', { name: 'Save' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await u.type(screen.getByLabelText(/Change summary/), 'rewrote')
    expect((save as HTMLButtonElement).disabled).toBe(false)
    await u.click(save)
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledWith('N-2', { version: 3, topic: 'Child A', notes: 'New text', summary: 'rewrote' }))
  })

  test('a 409 shows the conflict and never overwrites silently', async () => {
    api.patchNode.mockRejectedValueOnce(conflict(5))
    const u = user()
    await startEditing(u)
    await u.type(screen.getByLabelText(/Change summary/), 'mine')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/version 5/)
    expect(api.patchNode).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('keep mine saves the draft on top of the reported version, only when asked', async () => {
    api.patchNode.mockRejectedValueOnce(conflict(5))
    const u = user()
    await startEditing(u)
    await u.type(screen.getByLabelText(/Change summary/), 'mine')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await u.click(await screen.findByRole('button', { name: 'Keep mine' }))
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledTimes(2))
    expect(api.patchNode).toHaveBeenLastCalledWith('N-2', { version: 5, topic: 'Child A', notes: 'New text', summary: 'mine' })
  })

  test('reload drops the draft and refetches the node', async () => {
    api.patchNode.mockRejectedValueOnce(conflict(5))
    const u = user()
    await startEditing(u)
    await u.type(screen.getByLabelText(/Change summary/), 'mine')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    api.getNode.mockClear()
    await u.click(await screen.findByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(api.getNode).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Change summary')).toBeNull()
    expect(api.patchNode).toHaveBeenCalledTimes(1)
  })

  test('lists edges and growth areas and moves a growth area by index', async () => {
    api.getNode.mockResolvedValue(nodeView({ edges: [edgeView({ src: 'N-2', dst: 'N-3', kind: 'builds_on' })], growth_areas: [growth({ key: 'G-1' }), growth({ key: 'G-2', position: 1, text: 'Second' })] }))
    const u = user()
    mount()
    expect(await screen.findByText(/builds on ->/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Move G-2 up' }))
    await waitFor(() => expect(api.patchGrowth).toHaveBeenCalledWith('G-2', { version: 1, position: 0 }))
  })
})
