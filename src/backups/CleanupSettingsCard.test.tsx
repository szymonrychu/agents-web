// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { CleanupSettingsView } from '../api/archives'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { CleanupSettingsCard, FIELDS } from './CleanupSettingsCard'

const api = vi.hoisted(() => ({ getCleanupSettings: vi.fn(), putCleanupSettings: vi.fn() }))
vi.mock('../api/archives', async (orig) => ({ ...(await orig<typeof import('../api/archives')>()), ...api }))

const NOW = Date.parse('2026-11-02T12:00:00Z')
const POLICY = { enabled: true, dry_run: true, retention_days: 30, keep_newest: 3, interval_seconds: 21600, grace_seconds: 2400 }
const VIEW: CleanupSettingsView = { policy: POLICY, defaults: POLICY, source: 'environment', updated_at: null, run_requested_at: null, run_pending: false, last_sweep: null }
const SAVED: CleanupSettingsView = { ...VIEW, source: 'database', updated_at: '2026-10-31T12:00:00Z' }

const mount = () => render(<ThemeProvider theme={theme}><CleanupSettingsCard /></ThemeProvider>)
const input = async (label: string) => (await screen.findByLabelText(label)) as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const setNumber = async (label: string, value: string) => {
  const el = await input(label)
  await userEvent.clear(el)
  await userEvent.type(el, value)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(api).forEach((m) => m.mockReset())
  api.getCleanupSettings.mockResolvedValue(VIEW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CleanupSettingsCard', () => {
  test('shows the deployment defaults when nothing is saved', async () => {
    mount()
    expect(await screen.findByText('Using deployment defaults (not saved)')).toBeTruthy()
    expect((await input('Retention (days)')).value).toBe('30')
    expect((await input('Keep newest per name')).value).toBe('3')
    expect((await input('Interval (seconds)')).value).toBe('21600')
    expect((await input('Grace (seconds)')).value).toBe('2400')
    expect((await input('Sweep enabled')).checked).toBe(true)
    expect((await input('Dry run')).checked).toBe(true)
    expect(screen.getByRole('region', { name: 'Cleanup settings' })).toBeTruthy()
  })

  test('shows when the policy was saved', async () => {
    api.getCleanupSettings.mockResolvedValue(SAVED)
    mount()
    expect(await screen.findByText('Saved 2d ago')).toBeTruthy()
  })

  test('Save is disabled until something changes', async () => {
    mount()
    await input('Retention (days)')
    expect(save().disabled).toBe(true)
    await setNumber('Retention (days)', '14')
    expect(save().disabled).toBe(false)
    await setNumber('Retention (days)', '30')
    expect(save().disabled).toBe(true)
  })

  test.each([
    ['Retention (days)', '0', '1 to 3650'],
    ['Keep newest per name', '1001', '1 to 1000'],
    ['Interval (seconds)', '59', '60 to 2592000'],
    ['Grace (seconds)', '-1', '0 to 604800'],
  ])('an out-of-range value disables Save and explains the range: %s = %s', async (label, value, range) => {
    mount()
    await setNumber(label, value)
    expect(await screen.findByText(new RegExp(range))).toBeTruthy()
    expect(save().disabled).toBe(true)
  })

  test('an empty field disables Save', async () => {
    mount()
    const el = await input('Retention (days)')
    await userEvent.clear(el)
    expect(save().disabled).toBe(true)
  })

  test('Save sends all six fields as numbers and shows the stored result', async () => {
    api.putCleanupSettings.mockResolvedValue({ ...SAVED, policy: { ...POLICY, retention_days: 14 }, updated_at: '2026-11-02T12:00:00Z' })
    mount()
    await setNumber('Retention (days)', '14')
    await userEvent.click(save())
    await waitFor(() => expect(api.putCleanupSettings).toHaveBeenCalledWith({ enabled: true, dry_run: true, retention_days: 14, keep_newest: 3, interval_seconds: 21600, grace_seconds: 2400 }))
    expect(await screen.findByText('Saved 0s ago')).toBeTruthy()
    expect((await input('Retention (days)')).value).toBe('14')
    expect(save().disabled).toBe(true)
  })

  test('turning dry run off asks before saving', async () => {
    api.putCleanupSettings.mockResolvedValue({ ...SAVED, policy: { ...POLICY, dry_run: false } })
    mount()
    await userEvent.click(await input('Dry run'))
    await userEvent.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'Enable real deletes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.putCleanupSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(save())
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Enable real deletes?' })).getByRole('button', { name: 'Enable real deletes' }))
    await waitFor(() => expect(api.putCleanupSettings).toHaveBeenCalledWith(expect.objectContaining({ dry_run: false })))
  })

  test('saving with dry run already off does not ask', async () => {
    const live = { ...POLICY, dry_run: false }
    api.getCleanupSettings.mockResolvedValue({ ...SAVED, policy: live })
    api.putCleanupSettings.mockResolvedValue({ ...SAVED, policy: { ...live, retention_days: 7 } })
    mount()
    await setNumber('Retention (days)', '7')
    await userEvent.click(save())
    await waitFor(() => expect(api.putCleanupSettings).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a refused save shows the error and does not pretend it saved', async () => {
    api.putCleanupSettings.mockRejectedValue(new ApiError(422, 'invalid_request', 'body.retention_days: must be at least 1'))
    mount()
    await setNumber('Retention (days)', '14')
    await userEvent.click(save())
    expect(await screen.findByText(/body\.retention_days: must be at least 1/)).toBeTruthy()
    expect(screen.getByText('Using deployment defaults (not saved)')).toBeTruthy()
    expect((await input('Retention (days)')).value).toBe('14')
    expect(save().disabled).toBe(false)
  })

  test('shows the deployment default next to grace only', async () => {
    mount()
    expect(await screen.findByText(/default 2400/)).toBeTruthy()
    expect(screen.getAllByText(/^default /)).toHaveLength(1)
  })

  test('the field bounds equal the orchestrator OpenAPI bounds', () => {
    const spec = JSON.parse(readFileSync('openapi/orchestrator.json', 'utf8')) as {
      components: { schemas: { SweepPolicyIn: { properties: Record<string, { minimum: number; maximum: number }> } } }
    }
    const props = spec.components.schemas.SweepPolicyIn.properties
    expect(FIELDS.map((f) => f.key).sort()).toEqual(['grace_seconds', 'interval_seconds', 'keep_newest', 'retention_days'])
    for (const f of FIELDS) expect([f.key, f.min, f.max]).toEqual([f.key, props[f.key].minimum, props[f.key].maximum])
  })

  test('shows the load error', async () => {
    api.getCleanupSettings.mockRejectedValue(new ApiError(500, 'internal', 'boom'))
    mount()
    expect(await screen.findByText(/boom/)).toBeTruthy()
  })
})
