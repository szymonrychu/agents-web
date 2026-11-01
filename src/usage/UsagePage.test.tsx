// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { CurrentView, WindowView } from './api'
import { UsagePage } from './UsagePage'

const api = vi.hoisted(() => ({ getCurrent: vi.fn(), getHistory: vi.fn(), getSessions: vi.fn() }))
const client = vi.hoisted(() => ({ getMeta: vi.fn(), listPresets: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const NOW = Date.parse('2026-11-01T12:00:00Z')
const win = (o: Partial<WindowView> = {}): WindowView => ({
  percent: 22, resets_at: '2026-11-02T12:00:00Z', observed_at: '2026-11-01T11:58:00Z', stale: false, source: 'statusline', ...o,
})
const view = (o: Partial<CurrentView> = {}): CurrentView => ({ windows: {}, last_sample: null, last_probe: null, ...o })
const mount = () => render(<ThemeProvider theme={theme}><UsagePage onBack={() => {}} /></ThemeProvider>)
const card = (metric: string) => screen.getByTestId(`usage-card-${metric}`)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  api.getCurrent.mockReset()
  api.getHistory.mockReset().mockResolvedValue({ from: '2026-10-25T12:00:00Z', to: '2026-11-01T12:00:00Z', bucket_seconds: 60, points: [] })
  api.getSessions.mockReset().mockResolvedValue({ from: '2026-10-25T12:00:00Z', to: '2026-11-01T12:00:00Z', marks: [], truncated: false })
  client.getMeta.mockReset().mockResolvedValue({ usage: { configured: true, quota_default_pct: 100 } })
  client.listPresets.mockReset().mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('UsagePage cards', () => {
  test('renders a seven_day card with the percent, the reset time and the observed age', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win() } }))
    mount()
    const c = within(await screen.findByTestId('usage-card-seven_day'))
    expect(c.getByText('22%')).toBeTruthy()
    expect(c.getByText(/resets in 1d \(2026-11-02 12:00 UTC\)/)).toBeTruthy()
    expect(c.getByText(/observed 2m ago/)).toBeTruthy()
    expect(c.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('22')
  })

  test('has no five_hour card when the window is absent', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win() } }))
    mount()
    await screen.findByTestId('usage-card-seven_day')
    expect(screen.queryByTestId('usage-card-five_hour')).toBeNull()
  })

  test('shows five_hour before seven_day', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win(), five_hour: win({ percent: 40.5 }) } }))
    mount()
    await screen.findByTestId('usage-card-five_hour')
    expect(screen.getAllByTestId(/^usage-card-/).map((e) => e.dataset.testid)).toEqual(['usage-card-five_hour', 'usage-card-seven_day'])
    expect(within(card('five_hour')).getByText('40.5%')).toBeTruthy()
  })

  test('shows the source: agents for statusline, probe for probe', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { five_hour: win({ source: 'probe' }), seven_day: win({ source: 'statusline' }) } }))
    mount()
    await screen.findByTestId('usage-card-five_hour')
    expect(within(card('five_hour')).getByText('probe')).toBeTruthy()
    expect(within(card('seven_day')).getByText('agents')).toBeTruthy()
  })

  test.each([
    [79.9, 'primary'],
    [80, 'warning'],
    [94.9, 'warning'],
    [95, 'error'],
    [103, 'error'],
  ])('colours %s percent %s', async (percent, color) => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win({ percent }) } }))
    mount()
    const bar = within(await screen.findByTestId('usage-card-seven_day')).getByRole('progressbar')
    expect(bar.className).toContain(color === 'primary' ? 'MuiLinearProgress-colorPrimary' : `MuiLinearProgress-color${color[0].toUpperCase()}${color.slice(1)}`)
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.min(percent, 100)))
  })

  test('says so when there is no data yet', async () => {
    api.getCurrent.mockResolvedValue(view())
    mount()
    expect(await screen.findByText('No usage data yet')).toBeTruthy()
  })
})

describe('UsagePage alerts', () => {
  test('warns "Usage data is stale" when a window is stale', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win({ stale: true }) } }))
    mount()
    expect((await screen.findByText('Usage data is stale')).closest('[role="alert"]')).toBeTruthy()
  })

  test('no stale alert when every window is fresh', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { five_hour: win(), seven_day: win() } }))
    mount()
    await screen.findByTestId('usage-card-seven_day')
    expect(screen.queryByText('Usage data is stale')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('warns "Last probe failed: timeout" when the last probe failed and a window is absent', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win() }, last_probe: { at: '2026-11-01T11:00:00Z', ok: false, error: 'timeout' } }))
    mount()
    expect(await screen.findByText('Last probe failed: timeout')).toBeTruthy()
  })

  test('warns about the failed probe when a window is stale', async () => {
    api.getCurrent.mockResolvedValue(view({
      windows: { five_hour: win({ stale: true }), seven_day: win() }, last_probe: { at: '2026-11-01T11:00:00Z', ok: false, error: 'timeout' },
    }))
    mount()
    expect(await screen.findByText('Last probe failed: timeout')).toBeTruthy()
    expect(screen.getByText('Usage data is stale')).toBeTruthy()
  })

  test('stays quiet about the probe when both windows are present and fresh', async () => {
    api.getCurrent.mockResolvedValue(view({
      windows: { five_hour: win(), seven_day: win() }, last_probe: { at: '2026-11-01T11:00:00Z', ok: false, error: 'timeout' },
    }))
    mount()
    await screen.findByTestId('usage-card-seven_day')
    expect(screen.queryByText(/Last probe failed/)).toBeNull()
  })

  test('stays quiet about a probe that succeeded', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win({ stale: true }) }, last_probe: { at: '2026-11-01T11:00:00Z', ok: true, error: null } }))
    mount()
    await screen.findByText('Usage data is stale')
    expect(screen.queryByText(/Last probe failed/)).toBeNull()
  })

  test('warns "Usage service unavailable" when the fetch rejects', async () => {
    api.getCurrent.mockRejectedValue(new Error('network'))
    mount()
    expect((await screen.findByText('Usage service unavailable')).closest('[role="alert"]')).toBeTruthy()
    expect(screen.queryByText('No usage data yet')).toBeNull()
  })
})

describe('UsagePage', () => {
  test('shows the lazy usage history region under the cards, and a history failure leaves the cards alone', async () => {
    api.getCurrent.mockResolvedValue(view({ windows: { seven_day: win() } }))
    mount()
    const region = await screen.findByRole('region', { name: 'Usage history' })
    expect(await within(region).findByText('No usage history in this range')).toBeTruthy()
    expect(within(region).getByRole('button', { name: '7d' })).toBeTruthy()
    expect(screen.getByTestId('usage-card-seven_day')).toBeTruthy()
    cleanup()

    api.getHistory.mockRejectedValue(new Error('down'))
    mount()
    expect(await screen.findByText('Usage history unavailable')).toBeTruthy()
    expect(await screen.findByTestId('usage-card-seven_day')).toBeTruthy()
    expect(screen.queryByText('Usage service unavailable')).toBeNull()
  })

  test('Back calls onBack', async () => {
    api.getCurrent.mockResolvedValue(view())
    const onBack = vi.fn()
    render(<ThemeProvider theme={theme}><UsagePage onBack={onBack} /></ThemeProvider>)
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
