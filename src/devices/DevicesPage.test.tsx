// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { DeviceView } from './api'
import { DevicesPage } from './DevicesPage'

const api = vi.hoisted(() => ({ listDevices: vi.fn(), pairDevice: vi.fn(), regenerateCode: vi.fn(), revokeDevice: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const device = (id: string, over: Partial<DeviceView> = {}): DeviceView => ({
  device_id: id, name: `Tab ${id}`, plugin: 'sketch', created_at: '2026-11-01T10:00:00Z', revoked_at: null, state: 'active', paired_at: '2026-11-01T10:05:00Z',
  code_expires_at: null, code_status: null, ...over,
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

  const created = (over = {}) => ({ device_id: 'd3', name: 'Boox', plugin: 'sketch', code: '123456', expires_at: '2026-11-04T10:10:00Z', expires_in: 600, ...over })
  const pairBoox = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByLabelText('Device name'), '  Boox ')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
  }
  const pending = (over: Partial<DeviceView> = {}) => device('d3', { name: 'Boox', state: 'pending', paired_at: null, code_status: 'pending', ...over })

  test('pairs a device and shows the code grouped 3+3 with countdown and origin, never stored or logged', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const log = vi.spyOn(console, 'log')
    api.pairDevice.mockResolvedValue(created())
    api.listDevices.mockResolvedValue([device('d1'), pending()])
    mount()
    await screen.findByText('Tab d1')
    expect(screen.getByRole('button', { name: 'Pair' }).hasAttribute('disabled')).toBe(true)
    await pairBoox(user)
    expect(api.pairDevice).toHaveBeenCalledWith('Boox')
    expect((await screen.findByLabelText('Pairing code')).textContent).toBe('123 456')
    expect(screen.getByText('10:00')).toBeTruthy()
    expect(screen.getByLabelText('Server origin')).toHaveProperty('value', window.location.origin)
    expect(screen.getByRole('button', { name: 'New code' })).toBeTruthy()
    expect(screen.queryByLabelText('Device token')).toBeNull()
    expect(api.listDevices.mock.calls.length).toBeGreaterThan(1)
    expect(setItem).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('123456')
    expect(window.location.href).not.toContain('123456')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
  })

  test('New code replaces the shown code', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.regenerateCode.mockResolvedValue({ code: '654321', expires_at: '2026-11-04T10:20:00Z', expires_in: 600 })
    api.listDevices.mockResolvedValue([pending()])
    mount()
    await pairBoox(user)
    await screen.findByLabelText('Pairing code')
    await user.click(screen.getByRole('button', { name: 'New code' }))
    expect(api.regenerateCode).toHaveBeenCalledWith('d3')
    await waitFor(() => expect(screen.getByLabelText('Pairing code').textContent).toBe('654 321'))
  })

  test('New code failure shows the error and keeps the page usable', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.regenerateCode.mockRejectedValue(new ApiError(429, 'http_error', 'too many pending codes'))
    api.listDevices.mockResolvedValue([pending()])
    mount()
    await pairBoox(user)
    await screen.findByLabelText('Pairing code')
    await user.click(screen.getByRole('button', { name: 'New code' }))
    expect(await screen.findByText('too many pending codes')).toBeTruthy()
  })

  test('the code turns into Paired and is cleared when the device row becomes active', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.listDevices.mockResolvedValue([device('d3', { name: 'Boox' })])
    mount()
    await pairBoox(user)
    expect(await screen.findByText(/Boox is paired/)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
    expect(screen.queryByText('123 456')).toBeNull()
  })

  test('a locked code shows its own message and no code', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.listDevices.mockResolvedValue([pending({ code_status: 'locked' })])
    mount()
    await pairBoox(user)
    expect(await screen.findByText(/too many wrong attempts, generate a new code/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New code' })).toBeTruthy()
  })

  test('while a code is shown the list polls every 3 seconds', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.listDevices.mockResolvedValue([pending()])
    mount()
    await pairBoox(user)
    await screen.findByLabelText('Pairing code')
    const before = api.listDevices.mock.calls.length
    await waitFor(() => expect(api.listDevices.mock.calls.length).toBeGreaterThan(before), { timeout: 4_500 })
  })

  test('list shows Waiting for code, Active and Revoked, with no per-device pair again', async () => {
    api.listDevices.mockResolvedValue([device('d1'), pending(), device('d2', { revoked_at: '2026-11-02T10:00:00Z', state: 'revoked' })])
    mount()
    const wait = (await screen.findByText('Boox')).closest('tr')!
    expect(within(wait).getByText('Waiting for code')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /pair again/i })).toBeNull()
  })

  test('unmounting drops the code and a fresh mount never shows it', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    api.listDevices.mockResolvedValue([pending()])
    const view = mount()
    await pairBoox(user)
    await screen.findByLabelText('Pairing code')
    view.unmount()
    expect(screen.queryByText('123 456')).toBeNull()
    mount()
    await screen.findByText('Boox')
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
  })

  test('list refresh failure after a successful pair keeps the code and shows no pair error', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockResolvedValue(created())
    mount()
    await user.type(await screen.findByLabelText('Device name'), 'Boox')
    api.listDevices.mockRejectedValue(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByLabelText('Pairing code')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pair' })).toBeTruthy()
  })

  test('device name input is limited to 80 characters', async () => {
    mount()
    expect((await screen.findByLabelText('Device name')).getAttribute('maxlength')).toBe('80')
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

  test('revoking a stale device (404) explains it and refreshes the list', async () => {
    const user = userEvent.setup()
    api.revokeDevice.mockRejectedValue(new ApiError(404, 'http_error', 'not found'))
    mount()
    const row = (await screen.findByText('Tab d1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Revoke' }))
    const before = api.listDevices.mock.calls.length
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText(/already revoked or no longer exists/i)).toBeTruthy()
    await waitFor(() => expect(api.listDevices.mock.calls.length).toBeGreaterThan(before))
  })

  test('revoke failure shows the error and refreshes the list', async () => {
    const user = userEvent.setup()
    api.revokeDevice.mockRejectedValue(new ApiError(500, 'http_error', 'boom'))
    mount()
    const row = (await screen.findByText('Tab d1')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: 'Revoke' }))
    const before = api.listDevices.mock.calls.length
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText('boom')).toBeTruthy()
    await waitFor(() => expect(api.listDevices.mock.calls.length).toBeGreaterThan(before))
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

  test('401 shows a sign-in message', async () => {
    api.listDevices.mockRejectedValue(new ApiError(401, 'http_error', 'Unauthorized'))
    mount()
    expect(await screen.findByText(/not signed in/i)).toBeTruthy()
  })

  test('pair 403 shows a forbidden message and no code', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockRejectedValue(new ApiError(403, 'http_error', 'Forbidden'))
    mount()
    await user.type(await screen.findByLabelText('Device name'), 'Boox')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByText(/forbidden/i)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
  })

  test('network error on pairing is shown and no code appears', async () => {
    const user = userEvent.setup()
    api.pairDevice.mockRejectedValue(new TypeError('Failed to fetch'))
    mount()
    await user.type(await screen.findByLabelText('Device name'), 'Boox')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(await screen.findByText(/network error/i)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
  })
})
