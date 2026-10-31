// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { MatrixMeta, UserView } from './api'
import { DefaultPreset } from './DefaultPreset'
import { RulesPanel } from './RulesPanel'
import { UsersTable } from './UsersTable'

const api = vi.hoisted(() => ({ listUsers: vi.fn(), listRules: vi.fn(), addRule: vi.fn(), deleteRule: vi.fn(), getSettings: vi.fn(), setSettings: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const meta: MatrixMeta = {
  user_id: '@bot:hs', sync: { healthy: true, last_sync_at: null }, default_policy: 'deny', group_trigger: 'mention', homeserver_url: 'h',
  rule_kinds: { allow: ['facebook', 'user', 'room'], deny: ['facebook', 'user', 'room', 'display_name'] },
}
const user = (id: string, over: Partial<UserView> = {}): UserView => ({
  user_id: id, display_name: `Name ${id}`, facebook_id: null, rooms: ['!a', '!b'], access: { state: 'default', reason: 'default policy', rule_id: null }, ...over,
})
const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const wrap = (el: React.ReactNode) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  for (const f of [...Object.values(api), ...Object.values(client)]) f.mockReset()
  api.listUsers.mockResolvedValue([user('@fb_1:hs', { facebook_id: '1001', display_name: 'Alice' }), user('@bob:hs', { display_name: 'Bob' })])
  api.listRules.mockResolvedValue({
    allow: [{ id: 1, list: 'allow', kind: 'facebook', value: '1001', note: 'friend', created_at: '2026-10-25T10:00:00Z' }],
    deny: [{ id: 2, list: 'deny', kind: 'room', value: '!x', note: null, created_at: '2026-10-25T11:00:00Z' }],
  })
  api.addRule.mockResolvedValue({})
  api.deleteRule.mockResolvedValue(undefined)
  api.getSettings.mockResolvedValue({ default_preset_id: 'p1', preamble: null, default_preamble: 'Default' })
  api.setSettings.mockResolvedValue({ default_preset_id: 'p2', preamble: null, default_preamble: 'Default' })
  client.listPresets.mockResolvedValue([{ id: 'p1', name: 'Preset One', is_default: false }, { id: 'p2', name: 'Preset Two', is_default: false }])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ue = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('Access', () => {
  test('allows and denies a user', async () => {
    const u = ue()
    wrap(<UsersTable />)
    await flush()
    const alice = screen.getByText('Alice').closest('tr')!
    expect(within(alice).getByText('1001')).toBeTruthy()
    expect(within(alice).getByText('2')).toBeTruthy()
    await u.click(within(alice).getByRole('button', { name: 'Allow' }))
    expect(api.addRule).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    await flush(500)
    expect(api.addRule).not.toHaveBeenCalled()
    await u.click(within(alice).getByRole('button', { name: 'Allow' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Allow' }))
    expect(api.addRule).toHaveBeenCalledWith({ list: 'allow', kind: 'facebook', value: '1001' })
    await flush(500)

    const bob = screen.getByText('Bob').closest('tr')!
    await u.click(within(bob).getByRole('button', { name: 'Deny' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deny' }))
    expect(api.addRule).toHaveBeenLastCalledWith({ list: 'deny', kind: 'user', value: '@bob:hs' })
    await flush(500)

    await u.type(screen.getByRole('textbox', { name: 'Search' }), 'ali')
    await flush()
    expect(api.listUsers).toHaveBeenLastCalledWith({ q: 'ali' })
  })

  test('shows a failed users load and disables nothing silently', async () => {
    api.listUsers.mockRejectedValue(new ApiError(500, 'boom', 'down'))
    wrap(<UsersTable />)
    await flush()
    expect(screen.getByText('boom: down')).toBeTruthy()
  })

  test('manages rules', async () => {
    const u = ue()
    wrap(<RulesPanel meta={meta} />)
    await flush()
    expect(screen.getByText('1001')).toBeTruthy()
    expect(screen.getByText('friend')).toBeTruthy()
    expect(screen.getByText('!x')).toBeTruthy()

    await u.click(screen.getByRole('combobox', { name: 'List' }))
    await u.click(screen.getByRole('option', { name: 'allow' }))
    await u.click(screen.getByRole('combobox', { name: 'Kind' }))
    expect(screen.queryByRole('option', { name: 'display_name' })).toBeNull()
    await u.click(screen.getByRole('option', { name: 'user' }))
    await u.type(screen.getByRole('textbox', { name: 'Value' }), '@c:hs')
    await u.type(screen.getByRole('textbox', { name: 'Note' }), 'hi')
    await u.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(api.addRule).toHaveBeenCalledWith({ list: 'allow', kind: 'user', value: '@c:hs', note: 'hi' })

    await u.click(screen.getByRole('combobox', { name: 'List' }))
    await u.click(screen.getByRole('option', { name: 'deny' }))
    await u.click(screen.getByRole('combobox', { name: 'Kind' }))
    await u.click(screen.getByRole('option', { name: 'display_name' }))
    api.addRule.mockRejectedValueOnce(new ApiError(409, 'rule_conflict', 'already exists'))
    await u.type(screen.getByRole('textbox', { name: 'Value' }), 'Eve')
    await u.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(screen.getByText('rule_conflict: already exists')).toBeTruthy()

    const row = screen.getByText('1001').closest('tr')!
    await u.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(api.deleteRule).not.toHaveBeenCalled()
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(api.deleteRule).toHaveBeenCalledWith(1)
  })

  test('disables adding rules when the load failed', async () => {
    api.listRules.mockRejectedValue(new ApiError(500, 'boom', 'down'))
    wrap(<RulesPanel meta={meta} />)
    await flush()
    expect(screen.getByText('boom: down')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Add rule' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('saves the default preset', async () => {
    const u = ue()
    wrap(<DefaultPreset meta={meta} />)
    await flush()
    expect(screen.getByText(/rooms without their own preset/i)).toBeTruthy()
    expect(screen.getByText(/default policy is deny/i)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Preset' }).textContent).toContain('Preset One')
    await u.click(screen.getByRole('combobox', { name: 'Preset' }))
    await u.click(screen.getByRole('option', { name: 'Preset Two' }))
    await u.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.setSettings).toHaveBeenCalledWith({ default_preset_id: 'p2' })
  })
})
