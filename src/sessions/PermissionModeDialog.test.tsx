// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Meta, SessionView } from '../api/client'
import { theme } from '../theme'
import { PermissionModeDialog } from './PermissionModeDialog'

const api = vi.hoisted(() => ({ getMeta: vi.fn(), putPermissionMode: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const meta = { permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }] } as Meta
const session = (mode?: string) => ({ id: 'c-1', slug: 'alpha', spec: mode ? { wrapper: { permission_mode: mode } } : {}, status: {} }) as unknown as SessionView
const wrap = (s = session(), onClose = vi.fn()) => render(<ThemeProvider theme={theme}><PermissionModeDialog open session={s} onClose={onClose} /></ThemeProvider>)

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.getMeta.mockResolvedValue(meta)
})
afterEach(cleanup)

describe('PermissionModeDialog', () => {
  test('shows the current mode, unset as Allow all, and explains the restart behaviour', async () => {
    wrap()
    expect((await screen.findByRole('combobox', { name: 'Permission mode' })).textContent).toBe('Allow all')
    expect(screen.getByText(/idle agents restart now/i)).toBeTruthy()
    expect(screen.getByText(/busy agents.*after their turn/i)).toBeTruthy()
    cleanup()
    wrap(session('auto'))
    expect((await screen.findByRole('combobox', { name: 'Permission mode' })).textContent).toBe('Auto')
  })

  test('submit puts the chosen mode and reports the result', async () => {
    api.putPermissionMode.mockResolvedValue({ session_id: 'c-1', permission_mode: 'auto', preset_updated: true, preset_name: 'dev' })
    wrap()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Permission mode' }))
    await userEvent.click(screen.getByRole('option', { name: 'Auto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(api.putPermissionMode).toHaveBeenCalledWith('c-1', 'auto'))
    expect(await screen.findByText(/Saved/)).toBeTruthy()
    expect(screen.getByText(/Preset dev updated/)).toBeTruthy()
  })

  test('Apply is disabled until the mode changes', async () => {
    wrap(session('auto'))
    await screen.findByRole('combobox', { name: 'Permission mode' })
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('errors are shown', async () => {
    api.putPermissionMode.mockRejectedValue(new Error('boom'))
    wrap()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Permission mode' }))
    await userEvent.click(screen.getByRole('option', { name: 'Auto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('boom')).toBeTruthy()
  })

  test('a failed meta load is shown', async () => {
    api.getMeta.mockRejectedValue(new Error('no meta'))
    wrap()
    expect(await screen.findByText('no meta')).toBeTruthy()
  })
})
