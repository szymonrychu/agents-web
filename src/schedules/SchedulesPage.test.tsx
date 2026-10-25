// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { RunView, ScheduleView } from './api'
import { SchedulesPage } from './SchedulesPage'

const api = vi.hoisted(() => ({
  listSchedules: vi.fn(), updateSchedule: vi.fn(), runScheduleNow: vi.fn(), deleteSchedule: vi.fn(), listScheduleRuns: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))
vi.mock('./ScheduleForm', () => ({
  ScheduleForm: (p: { schedule?: ScheduleView; onSaved: (s: ScheduleView) => void; onCancel: () => void }) => (
    <div>
      <span>{p.schedule ? `form edit ${p.schedule.name}` : 'form new'}</span>
      <button onClick={() => p.onSaved({ ...(p.schedule ?? sched('n1', 'created')), name: 'saved' })}>mock save</button>
      <button onClick={p.onCancel}>mock cancel</button>
    </div>
  ),
}))

const run = (over: Partial<RunView> = {}): RunView =>
  ({
    id: 'r1', schedule_id: 's1', fire_time: '2026-10-27T06:00:00Z', trigger: 'manual', status: 'handled', reason: null,
    session_id: 'sess1', session_slug: 'slug-1', reuse: null, message_id: null, started_at: null, finished_at: null,
    created_at: '2026-10-27T06:00:00Z', updated_at: '2026-10-27T06:00:00Z', ...over,
  }) as RunView
const sched = (id: string, name: string, over: Partial<ScheduleView> = {}): ScheduleView =>
  ({
    id, name, cron: '0 6 * * 1-5', timezone: 'UTC', preset_id: 'p1', prompt: 'go', enabled: true,
    next_fires: ['2026-10-27T06:00:00Z'], last_run: run({ schedule_id: id }), created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', ...over,
  }) as ScheduleView

const mount = (onOpenSession?: (id: string) => void) =>
  render(<ThemeProvider theme={theme}><SchedulesPage onBack={() => {}} onOpenSession={onOpenSession} /></ThemeProvider>)

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  client.listPresets.mockReset()
  client.listPresets.mockResolvedValue([{ id: 'p1', name: 'Reviewer' }])
  api.listSchedules.mockResolvedValue([sched('s1', 'Morning'), sched('s2', 'Nightly', { enabled: false, next_fires: [], last_run: null })])
  api.listScheduleRuns.mockResolvedValue([run()])
})
afterEach(cleanup)

describe('SchedulesPage', () => {
  test('lists schedules with next fire time and last run status', async () => {
    mount()
    const row = (await screen.findByText('Morning')).closest('tr')!
    expect(within(row).getByText('0 6 * * 1-5')).toBeTruthy()
    expect(within(row).getByText('UTC')).toBeTruthy()
    expect(within(row).getByText('Reviewer')).toBeTruthy()
    expect(within(row).getByText(/2026/)).toBeTruthy()
    expect(within(row).getByText(/handled/)).toBeTruthy()
    const other = screen.getByText('Nightly').closest('tr')!
    expect(within(other).queryByText(/handled/)).toBeNull()
  })

  test('lists an empty state explaining schedules', async () => {
    api.listSchedules.mockResolvedValue([])
    mount()
    expect(await screen.findByText(/cron/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New schedule' })).toBeTruthy()
  })

  test('lists the server error message', async () => {
    api.listSchedules.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText(/boom/)).toBeTruthy()
  })

  test('controls: toggle flips enabled with the whole schedule and refreshes', async () => {
    const user = userEvent.setup()
    api.updateSchedule.mockResolvedValue(sched('s1', 'Morning', { enabled: false }))
    mount()
    await screen.findByText('Morning')
    await user.click(screen.getByRole('switch', { name: 'Enable Morning' }))
    expect(api.updateSchedule).toHaveBeenCalledWith('s1', { name: 'Morning', cron: '0 6 * * 1-5', timezone: 'UTC', preset_id: 'p1', prompt: 'go', enabled: false })
    await waitFor(() => expect(api.listSchedules).toHaveBeenCalledTimes(2))
  })

  test('controls: run now posts, refreshes and shows the runs; a failure shows the message', async () => {
    const user = userEvent.setup()
    api.runScheduleNow.mockResolvedValueOnce(run())
    mount()
    await screen.findByText('Morning')
    await user.click(screen.getAllByRole('button', { name: 'Run now' })[0])
    expect(api.runScheduleNow).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(api.listSchedules).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('table', { name: 'Runs' })).toBeTruthy()
    api.runScheduleNow.mockRejectedValueOnce(new Error('queue down'))
    await user.click(screen.getAllByRole('button', { name: 'Run now' })[1])
    expect(await screen.findByText(/queue down/)).toBeTruthy()
  })

  test('controls: expanding a row shows runs that open the session', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    mount(open)
    await screen.findByText('Morning')
    await user.click(screen.getByRole('button', { name: 'Show runs of Morning' }))
    await user.click(await screen.findByRole('link', { name: 'slug-1' }))
    expect(open).toHaveBeenCalledWith('sess1')
    expect(api.listScheduleRuns).toHaveBeenCalledWith('s1', 20)
  })

  test('delete asks for confirmation before calling the API', async () => {
    const user = userEvent.setup()
    api.deleteSchedule.mockResolvedValue(undefined)
    mount()
    await screen.findByText('Morning')
    await user.click(screen.getByRole('button', { name: 'Delete Morning' }))
    expect(api.deleteSchedule).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.deleteSchedule).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete Morning' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(api.deleteSchedule).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(api.listSchedules).toHaveBeenCalledTimes(2))
  })

  test('form: new and edit open the form and the list updates on save', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Morning')
    await user.click(screen.getByRole('button', { name: 'New schedule' }))
    expect(screen.getByText('form new')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'mock save' }))
    await waitFor(() => expect(api.listSchedules).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('form new')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit Morning' }))
    expect(screen.getByText('form edit Morning')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'mock cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('form edit Morning')).toBeNull()
    expect(api.listSchedules).toHaveBeenCalledTimes(2)
  })
})
