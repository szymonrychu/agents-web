// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { RunView } from './api'
import { ScheduleRuns } from './ScheduleRuns'

const api = vi.hoisted(() => ({ listScheduleRuns: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const run = (over: Partial<RunView> = {}): RunView =>
  ({
    id: 'r1', schedule_id: 's1', fire_time: '2026-10-27T06:00:00Z', trigger: 'scheduled', status: 'handled', reason: null,
    session_id: null, session_slug: null, reuse: null, message_id: null, started_at: null, finished_at: null,
    created_at: '2026-10-27T06:00:00Z', updated_at: '2026-10-27T06:00:00Z', ...over,
  }) as RunView

const mount = (props: { refreshKey?: number; onOpenSession?: (id: string) => void } = {}) => {
  const ui = (refreshKey: number) => (
    <ThemeProvider theme={theme}>
      <ScheduleRuns scheduleId="s1" timezone="Europe/Warsaw" refreshKey={refreshKey} onOpenSession={props.onOpenSession} />
    </ThemeProvider>
  )
  const r = render(ui(props.refreshKey ?? 0))
  return { rerender: (k: number) => r.rerender(ui(k)) }
}

beforeEach(() => {
  api.listScheduleRuns.mockReset()
  api.listScheduleRuns.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('renders', () => {
  test('renders runs newest first with status, trigger, reason and zoned fire time', async () => {
    api.listScheduleRuns.mockResolvedValue([
      run({ id: 'a', fire_time: '2026-10-26T06:00:00Z', trigger: 'scheduled', status: 'handled' }),
      run({ id: 'b', fire_time: '2026-10-28T10:30:00Z', trigger: 'manual', status: 'failed', reason: 'orchestrator down' }),
      run({ id: 'c', fire_time: '2026-10-27T06:00:00Z', trigger: 'scheduled', status: 'ignored', reason: 'overlap' }),
    ])
    mount()
    const rows = await screen.findAllByRole('row')
    expect(api.listScheduleRuns).toHaveBeenCalledWith('s1', 20)
    const body = rows.slice(1)
    expect(body).toHaveLength(3)
    expect(within(body[0]).getByText('manual')).toBeTruthy()
    expect(within(body[0]).getByLabelText('failed: orchestrator down')).toBeTruthy()
    expect(within(body[0]).getByText(/11:30/)).toBeTruthy()
    expect(within(body[1]).getByLabelText('ignored: overlap')).toBeTruthy()
    expect(within(body[2]).getByText('scheduled')).toBeTruthy()
    expect(within(body[2]).getByLabelText('handled')).toBeTruthy()
  })

  test('renders an empty message', async () => {
    mount()
    expect(await screen.findByText('No runs yet')).toBeTruthy()
  })
})

describe('session link', () => {
  test('session link opens the run session; runs without a session have none', async () => {
    api.listScheduleRuns.mockResolvedValue([
      run({ id: 'a', session_id: 'sess-1', session_slug: 'nightly-1' }),
      run({ id: 'b', fire_time: '2026-10-26T06:00:00Z', status: 'failed', reason: 'x' }),
    ])
    const onOpenSession = vi.fn()
    mount({ onOpenSession })
    const link = await screen.findByRole('link', { name: 'nightly-1' })
    expect(screen.getAllByRole('link')).toHaveLength(1)
    await userEvent.setup().click(link)
    expect(onOpenSession).toHaveBeenCalledWith('sess-1')
  })
})

describe('refresh', () => {
  test('refresh happens every 10 s and on refreshKey change', async () => {
    vi.useFakeTimers()
    const { rerender } = mount({ refreshKey: 0 })
    await act(async () => {})
    expect(api.listScheduleRuns).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(api.listScheduleRuns).toHaveBeenCalledTimes(2)
    rerender(1)
    await act(async () => {})
    expect(api.listScheduleRuns).toHaveBeenCalledTimes(3)
  })
})
