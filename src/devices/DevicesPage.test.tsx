// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { DeviceView } from './api'
import { DevicesPage } from './DevicesPage'

const api = vi.hoisted(() => ({ listDevices: vi.fn(), pairDevice: vi.fn(), revokeDevice: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const device = (id: string, over: Partial<DeviceView> = {}): DeviceView => ({
  device_id: id, name: `Tab ${id}`, plugin: 'sketch', created_at: '2026-11-01T10:00:00Z', revoked_at: null, ...over,
})
const mount = () => render(<ThemeProvider theme={theme}><DevicesPage onBack={() => {}} /></ThemeProvider>)

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.listDevices.mockResolvedValue([device('d1'), device('d2', { revoked_at: '2026-11-02T10:00:00Z' })])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DevicesPage', () => {
  test('lists devices with active and revoked state', async () => {
    mount()
    const active = (await screen.findByText('Tab d1')).closest('tr')!
    expect(within(active).getByText('Active')).toBeTruthy()
    expect(within(active).getByRole('button', { name: 'Revoke' })).toBeTruthy()
    const revoked = screen.getByText('Tab d2').closest('tr')!
    expect(within(revoked).getByText(/Revoked/)).toBeTruthy()
    expect(within(revoked).queryByRole('button', { name: 'Revoke' })).toBeNull()
  })

  test('pairs a device and shows the token once with the server origin', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const log = vi.spyOn(console, 'log')
    api.pairDevice.mockResolvedValue({ device_id: 'd3', name: 'Boox', plugin: 'sketch', token: 'secret-token-123' })
    mount()
    await screen.findByText('Tab d1')
    expect(screen.getByRole('button', { name: 'Pair' }).hasAttribute('disabled')).toBe(true)
    await user.type(screen.getByLabelText('Device name'), '  Boox ')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(api.pairDevice).toHaveBeenCalledWith('Boox')
    const field = (await screen.findByLabelText('Device token')) as HTMLInputElement
    expect(field.value).toBe('secret-token-123')
    expect(field.readOnly).toBe(true)
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy()
    expect(screen.getByLabelText('Server origin')).toHaveProperty('value', window.location.origin)
    expect(api.listDevices.mock.calls.length).toBeGreaterThan(1)
    expect(setItem).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token-123')
    expect(window.location.href).not.toContain('secret-token-123')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByDisplayValue('secret-token-123')).toBeNull()
  })

  test('copies the token', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    api.pairDevice.mockResolvedValue({ device_id: 'd3', name: 'Boox', plugin: 'sketch', token: 'tok' })
    mount()
    await user.type(await screen.findByLabelText('Device name'), 'Boox')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    await user.click(await screen.findByRole('button', { name: 'Copy token' }))
    expect(writeText).toHaveBeenCalledWith('tok')
  })

  test('revoke asks for confirmation and then revokes', async () => {
    const user = userEvent.setup()
    api.revokeDevice.mockResolvedValue(undefined)
    mount()
    const row = (await screen.findByText('Tab d1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Revoke' }))
    expect(api.revokeDevice).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(api.revokeDevice).toHaveBeenCalledWith('d1'))
  })

  test('cancelling the confirm does not revoke', async () => {
    const user = userEvent.setup()
    mount()
    const row = (await screen.findByText('Tab d1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Revoke' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(api.revokeDevice).not.toHaveBeenCalled()
  })

  test('403 shows a forbidden message', async () => {
    api.listDevices.mockRejectedValue(new ApiError(403, 'http_error', 'Forbidden'))
    mount()
    expect(await screen.findByText(/forbidden/i)).toBeTruthy()
  })

  test('network error on pairing is shown and no token appears', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockRejectedValue(new TypeError('Failed to fetch'))
    mount()
    await user.type(await screen.findByLabelText('Device name'), 'Boox')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByText(/network error/i)).toBeTruthy()
    expect(screen.queryByLabelText('Device token')).toBeNull()
  })
})
