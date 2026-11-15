// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { ProjectQueue, QueueItem } from './autostartApi'
import { SpecQueuePanel } from './SpecQueuePanel'
import { phoneColumnProblems } from '../test/emittedCss'

const api = vi.hoisted(() => ({ listSpecQueue: vi.fn(), moveQueued: vi.fn(), removeQueued: vi.fn(), putAutostart: vi.fn() }))
vi.mock('./autostartApi', async (orig) => ({ ...(await orig<typeof import('./autostartApi')>()), ...api }))

const item = (id: number, position: number, over: Partial<QueueItem> = {}): QueueItem => ({
  id, spec: `S-${id}`, title: `Title ${id}`, position, ordinal: id, hold_reason: null, created_at: new Date(Date.now() - 3 * 3600_000).toISOString(), ...over,
})
const queue = (over: Partial<ProjectQueue> = {}): ProjectQueue => ({
  project: 'alpha', max_active_sessions: 2, max_usage_pct: 80, state: 'ready', items: [item(11, 1), item(12, 2), item(13, 3)], ...over,
})
const mount = () => render(<MemoryRouter><ThemeProvider theme={theme}><SpecQueuePanel project="alpha" /></ThemeProvider></MemoryRouter>)
const rows = () => within(screen.getByRole('table', { name: 'Spec queue' })).getAllByRole('row').slice(1)

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.listSpecQueue.mockResolvedValue([queue()])
  api.moveQueued.mockResolvedValue(queue())
  api.removeQueued.mockResolvedValue(undefined)
  api.putAutostart.mockResolvedValue({ project: 'alpha', max_active_sessions: 1, max_usage_pct: null, configured: false, updated_at: null })
})
afterEach(cleanup)

describe('SpecQueuePanel', () => {
  test('renders queue rows in position order', async () => {
    api.listSpecQueue.mockResolvedValue([queue({ items: [item(13, 3), item(11, 1), item(12, 2)] })])
    mount()
    await screen.findByText('Title 11')
    expect(api.listSpecQueue).toHaveBeenCalledWith('alpha')
    const cells = rows().filter((r) => within(r).queryByRole('link')).map((r) => within(r).getByRole('link').textContent)
    expect(cells).toEqual(['S-11', 'S-12', 'S-13'])
    expect(within(rows()[0]).getByRole('link').getAttribute('href')).toBe('/specs/S-11')
    expect(within(rows()[0]).getByText('3h ago')).toBeTruthy()
    expect(screen.getByText('autostart on')).toBeTruthy()
  })

  test('shows autostart off - set limits when unconfigured', async () => {
    api.listSpecQueue.mockResolvedValue([queue({ max_active_sessions: null, max_usage_pct: null, state: 'off', items: [] })])
    mount()
    expect(await screen.findByText('autostart off - set limits')).toBeTruthy()
  })

  test('shows off when the project has no queue data', async () => {
    api.listSpecQueue.mockResolvedValue([])
    mount()
    expect(await screen.findByText('autostart off - set limits')).toBeTruthy()
  })

  test('shows usage unknown', async () => {
    api.listSpecQueue.mockResolvedValue([queue({ state: 'usage_unknown' })])
    mount()
    expect(await screen.findByText('usage unknown')).toBeTruthy()
  })

  test('drag row 3 onto row 1 calls move before', async () => {
    mount()
    await screen.findByText('Title 13')
    fireEvent.dragStart(rows()[2])
    fireEvent.dragOver(rows()[0])
    fireEvent.drop(rows()[0])
    await waitFor(() => expect(api.moveQueued).toHaveBeenCalledWith(13, { before: 11 }))
  })

  test('drop past the last row moves to the end position', async () => {
    mount()
    await screen.findByText('Title 11')
    fireEvent.dragStart(rows()[0])
    const end = screen.getByText('Drop here to move to the end')
    fireEvent.dragOver(end)
    fireEvent.drop(end)
    await waitFor(() => expect(api.moveQueued).toHaveBeenCalledWith(11, { position: 3 }))
  })

  test('Up button calls move position p-1 and Down p+1', async () => {
    mount()
    await screen.findByText('Title 12')
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Move S-12 up' }))
    await waitFor(() => expect(api.moveQueued).toHaveBeenCalledWith(12, { position: 1 }))
    await waitFor(() => expect((within(rows()[1]).getByRole('button', { name: 'Move S-12 down' }) as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Move S-12 down' }))
    await waitFor(() => expect(api.moveQueued).toHaveBeenCalledWith(12, { position: 3 }))
    expect((within(rows()[0]).getByRole('button', { name: 'Move S-11 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rows()[2]).getByRole('button', { name: 'Move S-13 down' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('save sends nulls for empty fields', async () => {
    mount()
    const sessions = await screen.findByLabelText('Max active sessions')
    await waitFor(() => expect((sessions as HTMLInputElement).value).toBe('2'))
    await userEvent.clear(sessions)
    await userEvent.clear(screen.getByLabelText('Max usage %'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.putAutostart).toHaveBeenCalledWith('alpha', { max_active_sessions: null, max_usage_pct: null }))
  })

  test('save sends the typed numbers and shows a 422', async () => {
    api.putAutostart.mockRejectedValueOnce(new ApiError(422, 'invalid_request', 'bad limit'))
    mount()
    const sessions = await screen.findByLabelText('Max active sessions')
    await waitFor(() => expect((sessions as HTMLInputElement).value).toBe('2'))
    await userEvent.clear(sessions)
    await userEvent.type(sessions, '4')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.putAutostart).toHaveBeenCalledWith('alpha', { max_active_sessions: 4, max_usage_pct: 80 }))
    expect(await screen.findByText(/bad limit/)).toBeTruthy()
  })

  test('409 not_queued shows changed meanwhile and refetches', async () => {
    api.moveQueued.mockRejectedValueOnce(new ApiError(409, 'not_queued', 'not queued'))
    mount()
    await screen.findByText('Title 12')
    const before = api.listSpecQueue.mock.calls.length
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Move S-12 up' }))
    expect(await screen.findByText('changed meanwhile, reloaded')).toBeTruthy()
    await waitFor(() => expect(api.listSpecQueue.mock.calls.length).toBeGreaterThan(before))
  })

  test('remove asks for confirmation then calls DELETE', async () => {
    mount()
    await screen.findByText('Title 12')
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Remove S-12' }))
    expect(api.removeQueued).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.removeQueued).toHaveBeenCalledWith(12))
  })
})

describe('SpecQueuePanel phone columns', () => {
  test('sits in a scroll box and hides the low-priority columns on phones', async () => {
    mount()
    await screen.findByText('Title 11')
    expect(phoneColumnProblems(screen.getByRole('table', { name: 'Spec queue' }), [], ['#', 'Spec', 'Title', 'Queued'])).toEqual([])
  })
})
