// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Meta, PresetView } from '../api/client'
import { theme } from '../theme'
import type { HistoryView, MarkView, PointView, SessionsView } from './api'
import UsageHistory from './UsageHistory'

const api = vi.hoisted(() => ({ getHistory: vi.fn(), getSessions: vi.fn() }))
const client = vi.hoisted(() => ({ getMeta: vi.fn(), listPresets: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))
// jsdom has no layout: the chart itself is covered by UsageChart.test.tsx, here only the props it receives matter.
vi.mock('./UsageChart', () => ({
  UsageChart: (p: { series: { metric: string }[]; quotas: { value: number; label: string }[]; from: Date; to: Date }) => (
    <div data-testid="chart" data-series={p.series.map((s) => s.metric).join(',')} data-quotas={p.quotas.map((q) => `${q.value}:${q.label}`).join(',')} data-from={p.from.toISOString()} data-to={p.to.toISOString()} />
  ),
}))

const NOW = Date.parse('2026-11-01T12:00:00Z')
const DAY = 86_400_000
const point = (metric: string, percent = 22): PointView => ({ metric, observed_at: '2026-11-01T11:00:00Z', percent, resets_at: '2026-11-02T00:00:00Z', source: 'statusline' })
const history = (points: PointView[]): HistoryView => ({ from: '2026-10-25T12:00:00Z', to: '2026-11-01T12:00:00Z', bucket_seconds: 60, points } as HistoryView)
const mark: MarkView = { session_id: 's-1', slug: 'alpha', preset_id: null, preset_name: 'fast', origin: 'ui', started_at: '2026-11-01T06:00:00Z', ended_at: null }
const sessions = (marks: MarkView[] = []): SessionsView => ({ from: '2026-10-25T12:00:00Z', to: '2026-11-01T12:00:00Z', marks, truncated: false })
const mount = () => render(<ThemeProvider theme={theme}><UsageHistory /></ThemeProvider>)
const chart = () => screen.getByTestId('chart')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(api).forEach((f) => f.mockReset())
  Object.values(client).forEach((f) => f.mockReset())
  api.getHistory.mockResolvedValue(history([point('five_hour')]))
  api.getSessions.mockResolvedValue(sessions([mark]))
  client.getMeta.mockResolvedValue({ usage: { configured: true, quota_default_pct: 100 } } as Meta)
  client.listPresets.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('UsageHistory', () => {
  test('default range 7d requests history and sessions with from, to and max_points', async () => {
    mount()
    await screen.findByTestId('chart')
    expect(api.getHistory).toHaveBeenCalledTimes(1)
    expect(api.getHistory).toHaveBeenCalledWith({ from: new Date(NOW - 7 * DAY).toISOString(), to: new Date(NOW).toISOString(), max_points: 500 })
    expect(api.getSessions).toHaveBeenCalledWith({ from: new Date(NOW - 7 * DAY).toISOString(), to: new Date(NOW).toISOString() })
    expect(screen.getByRole('button', { name: '7d' }).getAttribute('aria-pressed')).toBe('true')
    expect(chart().dataset.from).toBe(new Date(NOW - 7 * DAY).toISOString())
    expect(screen.getByTestId('session-bar-s-1')).toBeTruthy()
  })

  test('range switch refetches with that span', async () => {
    mount()
    await screen.findByTestId('chart')
    await userEvent.click(screen.getByRole('button', { name: '30d' }))
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(2))
    expect(api.getHistory).toHaveBeenLastCalledWith({ from: new Date(NOW - 30 * DAY).toISOString(), to: new Date(NOW).toISOString(), max_points: 500 })
    expect(api.getSessions).toHaveBeenLastCalledWith({ from: new Date(NOW - 30 * DAY).toISOString(), to: new Date(NOW).toISOString() })
    await userEvent.click(screen.getByRole('button', { name: '24h' }))
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(3))
    expect(api.getHistory).toHaveBeenLastCalledWith({ from: new Date(NOW - DAY).toISOString(), to: new Date(NOW).toISOString(), max_points: 500 })
  })

  test('refreshes every 60 seconds, with a window that moves on', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    mount()
    await screen.findByTestId('chart')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getHistory).toHaveBeenCalledTimes(2)
    expect(api.getHistory).toHaveBeenLastCalledWith({ from: new Date(NOW + 60_000 - 7 * DAY).toISOString(), to: new Date(NOW + 60_000).toISOString(), max_points: 500 })
  })

  test('empty history shows the message and still renders the timeline', async () => {
    api.getHistory.mockResolvedValue(history([]))
    mount()
    expect(await screen.findByText('No usage history in this range')).toBeTruthy()
    expect(screen.queryByTestId('chart')).toBeNull()
    expect(screen.getByTestId('session-bar-s-1')).toBeTruthy()
  })

  test('error state', async () => {
    api.getHistory.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Usage history unavailable')).toBeTruthy()
    expect(screen.queryByTestId('chart')).toBeNull()
  })

  test('only windows with data become lines', async () => {
    api.getHistory.mockResolvedValue(history([point('seven_day'), point('seven_day_opus')]))
    mount()
    await screen.findByTestId('chart')
    expect(chart().dataset.series).toBe('seven_day')
  })

  test('quota lines come from the orchestrator default and the presets', async () => {
    client.getMeta.mockResolvedValue({ usage: { configured: true, quota_default_pct: 90 } } as Meta)
    client.listPresets.mockResolvedValue([{ name: 'fast', spec: { usage_quota: { five_hour_pct: 60 } } }] as unknown as PresetView[])
    mount()
    await waitFor(() => expect(chart().dataset.quotas).toBe('90:Default quota,60:5-hour quota: fast'))
  })

  test('without presets or meta the chart still draws, with no quota lines', async () => {
    client.listPresets.mockRejectedValue(new Error('down'))
    mount()
    await screen.findByTestId('chart')
    expect(chart().dataset.quotas).toBe('')
  })
})
