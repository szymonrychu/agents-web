// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { RetentionView } from './api'
import { RetentionCard } from './RetentionCard'

const api = vi.hoisted(() => ({ getRetention: vi.fn(), putRetention: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const view = (over: Partial<RetentionView> = {}): RetentionView => ({
  retention_days: 90,
  updated_at: '2026-10-20T08:00:00Z',
  last_sweep_at: '2026-11-01T03:00:00Z',
  last_sweep_deleted: 3,
  ...over,
})

const mount = () => render(<ThemeProvider theme={theme}><RetentionCard /></ThemeProvider>)
const field = () => screen.getByLabelText('Retention days') as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const setDays = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  await user.clear(field())
  if (value) await user.type(field(), value)
}

beforeEach(() => {
  api.getRetention.mockReset()
  api.getRetention.mockResolvedValue(view())
  api.putRetention.mockReset()
})
afterEach(cleanup)

describe('RetentionCard', () => {
  test('shows days and the last sweep', async () => {
    mount()
    expect(await screen.findByText('Keep 90 days')).toBeTruthy()
    expect(screen.getByText(`Last sweep: ${new Date('2026-11-01T03:00:00Z').toLocaleString()}, 3 deleted`)).toBeTruthy()
    expect(field().value).toBe('90')
  })

  test('says so when it never swept', async () => {
    api.getRetention.mockResolvedValue(view({ last_sweep_at: null, last_sweep_deleted: null }))
    mount()
    expect(await screen.findByText('No sweep yet')).toBeTruthy()
    expect(screen.queryByText(/Last sweep/)).toBeNull()
  })

  test('shows a load error', async () => {
    api.getRetention.mockRejectedValue(new Error('history down'))
    mount()
    expect(await screen.findByText('history down')).toBeTruthy()
  })

  test('saves a new value and shows the returned row', async () => {
    api.putRetention.mockResolvedValue(view({ retention_days: 120, last_sweep_at: null, last_sweep_deleted: null }))
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    expect(saveButton().disabled).toBe(true)
    await setDays(user, '120')
    await user.click(saveButton())
    await waitFor(() => expect(api.putRetention).toHaveBeenCalledWith(120))
    expect(await screen.findByText('Keep 120 days')).toBeTruthy()
    expect(screen.getByText('No sweep yet')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('shows a save error and keeps the stored value', async () => {
    api.putRetention.mockRejectedValue(new Error('rejected'))
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    await setDays(user, '120')
    await user.click(saveButton())
    expect(await screen.findByText('rejected')).toBeTruthy()
    expect(screen.getByText('Keep 90 days')).toBeTruthy()
  })

  test.each(['0', '4000', '', '1.5'])('refuses %j and says why', async (value) => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    await setDays(user, value)
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText('Enter a whole number from 1 to 3650')).toBeTruthy()
  })

  test('accepts the bounds 1 and 3650', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    for (const value of ['1', '3650']) {
      await setDays(user, value)
      expect(saveButton().disabled).toBe(false)
      expect(screen.queryByText('Enter a whole number from 1 to 3650')).toBeNull()
    }
  })

  test('warns before lowering and saves on confirm', async () => {
    api.putRetention.mockResolvedValue(view({ retention_days: 30 }))
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    await setDays(user, '30')
    await user.click(saveButton())
    expect(await screen.findByText('Discarded sessions older than 30 days will be deleted now.')).toBeTruthy()
    expect(api.putRetention).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Lower retention' }))
    await waitFor(() => expect(api.putRetention).toHaveBeenCalledWith(30))
    expect(await screen.findByText('Keep 30 days')).toBeTruthy()
  })

  test('cancelling the warning saves nothing', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('Keep 90 days')
    await setDays(user, '30')
    await user.click(saveButton())
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(api.putRetention).not.toHaveBeenCalled()
    expect(screen.getByText('Keep 90 days')).toBeTruthy()
  })
})
