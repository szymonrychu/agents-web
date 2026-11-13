// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { NodePanel } from './NodePanel'
import { edgeView, growth, link, nodeView } from './testUtils'

const api = vi.hoisted(() => ({ getNode: vi.fn(), patchNode: vi.fn(), patchGrowth: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

vi.mock('./NodeHistory', () => ({
  NodeHistory: (p: { nodeKey: string; rowVersion: number; onRestored: () => void; onStale: () => void }) => <><button onClick={p.onRestored}>{`history ${p.nodeKey} row ${p.rowVersion}`}</button><button onClick={p.onStale}>stale</button></>,
}))
vi.mock('./DirectionDialog', () => ({
  DirectionDialog: (p: { mapKey: string; nodeKey?: string; onSaved: (d: unknown) => void }) => <button onClick={() => p.onSaved({})}>{`direction dialog ${p.mapKey} ${p.nodeKey}`}</button>,
}))

const mount = (onChanged = vi.fn(), extra: { mapKey?: string; refreshKey?: number; descendants?: number } = {}) =>
  render(<MemoryRouter><ThemeProvider theme={theme}><NodePanel nodeKey="N-2" {...extra} onChanged={onChanged} onDeleted={() => {}} onOpenNode={() => {}} /></ThemeProvider></MemoryRouter>)
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
  test('task and spec keys link to their taskboard pages', async () => {
    api.getNode.mockResolvedValue(nodeView({
      links: [link({ id: 5, ref_key: 'T-12' }), link({ id: 6, ref_key: 'S-3' })],
      growth_areas: [growth({ status: 'taken', task_key: 'T-7' })],
    }))
    mount()
    expect((await screen.findByRole('link', { name: 'T-12' })).getAttribute('href')).toBe('/tasks/T-12')
    expect(screen.getByRole('link', { name: 'S-3' }).getAttribute('href')).toBe('/specs/S-3')
    expect(screen.getByRole('link', { name: 'T-7' }).getAttribute('href')).toBe('/tasks/T-7')
  })

  test('the node delete dialog names the descendant count', async () => {
    const u = user()
    mount(vi.fn(), { descendants: 4 })
    const section = await screen.findByRole('button', { name: 'Delete' })
    await u.click(section)
    expect(screen.getByText(/4 descendant nodes/)).toBeTruthy()
  })

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

  test('History shows the node history with the row version and refetches after a restore', async () => {
    const onChanged = vi.fn()
    const u = user()
    mount(onChanged)
    expect(screen.queryByText(/^history/)).toBeNull()
    await u.click(await screen.findByRole('button', { name: 'History' }))
    api.getNode.mockClear()
    await u.click(screen.getByRole('button', { name: 'history N-2 row 3' }))
    await waitFor(() => expect(api.getNode).toHaveBeenCalledTimes(1))
    expect(onChanged).toHaveBeenCalled()
  })

  test('a refresh during an edit keeps the base version, so Save hits a 409 instead of overwriting', async () => {
    const u = user()
    const panel = (refreshKey: number) => (
      <MemoryRouter><ThemeProvider theme={theme}><NodePanel nodeKey="N-2" refreshKey={refreshKey} onChanged={() => {}} onDeleted={() => {}} onOpenNode={() => {}} /></ThemeProvider></MemoryRouter>
    )
    const { rerender } = render(panel(0))
    await u.click(await screen.findByRole('button', { name: /Edit notes/ }))
    await u.type(screen.getByLabelText(/Change summary/), 'mine')
    api.getNode.mockResolvedValue(nodeView({ version: 4, current_version: 4, notes: 'other writer' }))
    api.patchNode.mockRejectedValueOnce(conflict(4))
    rerender(panel(1))
    await screen.findByText(/version 4/)
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledWith('N-2', expect.objectContaining({ version: 3 })))
    expect((await screen.findByRole('alert')).textContent).toMatch(/version 4/)
  })

  test('a stale restore in the history reloads the node', async () => {
    const u = user()
    mount()
    await u.click(await screen.findByRole('button', { name: 'History' }))
    api.getNode.mockClear()
    await u.click(screen.getByRole('button', { name: 'stale' }))
    await waitFor(() => expect(api.getNode).toHaveBeenCalledTimes(1))
  })

  test('a node of another map shows a notice', async () => {
    mount(vi.fn(), { mapKey: 'M-9' })
    expect((await screen.findByText(/belongs to map M-1/))).toBeTruthy()
  })

  test('Send direction opens the dialog for this node and closes after it saved', async () => {
    const u = user()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Send direction' }))
    await u.click(screen.getByRole('button', { name: 'direction dialog M-1 N-2' }))
    expect(screen.queryByText(/direction dialog/)).toBeNull()
  })
})
