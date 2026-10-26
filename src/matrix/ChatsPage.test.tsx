// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { MessageView, RoomDetail, RoomView } from './api'
import { ChatsPage } from './ChatsPage'

const api = vi.hoisted(() => ({
  getMeta: vi.fn(), listRooms: vi.fn(), getRoom: vi.fn(), setRoomSettings: vi.fn(),
  listRoomMessages: vi.fn(), addRule: vi.fn(), deleteRule: vi.fn(), listRules: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const room = (id: string, over: Partial<RoomView> = {}): RoomView => ({
  room_id: id, alias: null, name: `Room ${id}`, kind: 'dm', membership: 'join', encrypted: false, message_request: false,
  member_count: 2, access: { state: 'default', reason: 'default policy', rule_id: null }, preset_id: null, trigger: null,
  effective_trigger: 'all', queued: 0, last_event_at: '2026-10-25T10:00:00Z', session: null, ...over,
})
const detail = (r: RoomView): RoomDetail => ({
  ...r,
  members: [{ user_id: '@fb_1:hs', display_name: 'Alice', facebook_id: '1001', membership: 'join', access: { state: 'allowed', reason: 'rule', rule_id: 4 } }],
})
const msg = (id: string, over: Partial<MessageView> = {}): MessageView => ({
  id, at: '2026-10-25T10:00:00Z', body: `body ${id}`, direction: 'in', reason: null, run_id: null, sender: '@a:hs', sender_name: 'Alice', status: 'handled', ...over,
})

const onOpenSession = vi.fn()
const mount = () => render(<ThemeProvider theme={theme}><ChatsPage onBack={() => {}} onOpenSession={onOpenSession} /></ThemeProvider>)
const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

let rooms: RoomView[]
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  for (const f of [...Object.values(api), ...Object.values(client), onOpenSession]) f.mockReset()
  rooms = [
    room('!a', { name: 'Alice DM', kind: 'dm', access: { state: 'allowed', reason: 'rule 4', rule_id: 4 }, session: { id: 'sid-1', slug: 'agent-x', status: 'active' }, queued: 3, message_request: true }),
    room('!b', { name: 'Crew', kind: 'group', encrypted: true, effective_trigger: 'mention' }),
    room('!c', { name: 'Bridge', kind: 'infrastructure' }),
  ]
  api.getMeta.mockResolvedValue({ user_id: '@bot:hs', sync: { healthy: true, last_sync_at: null }, default_policy: 'deny', group_trigger: 'mention', homeserver_url: 'h', rule_kinds: {} })
  api.listRooms.mockImplementation(async (o: { kind?: string; access?: string } = {}) =>
    rooms.filter((r) => (!o.kind || r.kind === o.kind) && (!o.access || r.access.state === o.access)))
  api.getRoom.mockImplementation(async (id: string) => detail(rooms.find((r) => r.room_id === id)!))
  api.listRules.mockResolvedValue({ allow: [], deny: [] })
  api.listRoomMessages.mockResolvedValue([])
  client.listPresets.mockResolvedValue([{ id: 'p1', name: 'Preset One', is_default: false }])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ChatsPage', () => {
  test('lists rooms with access and session', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mount()
    await flush()
    const row = screen.getByText('Alice DM').closest('tr')!
    expect(within(row).getByText('DM')).toBeTruthy()
    expect(within(row).getByText('Message request')).toBeTruthy()
    expect(within(row).getByText(/allowed/)).toBeTruthy()
    expect(within(row).getByText('3')).toBeTruthy()
    await user.click(within(row).getByText('agent-x'))
    expect(onOpenSession).toHaveBeenCalledWith('sid-1')
    const crew = screen.getByText('Crew').closest('tr')!
    expect(within(crew).getByText('Group')).toBeTruthy()
    expect(within(crew).getByText('Encrypted')).toBeTruthy()
    expect(within(crew).getByText(/default/)).toBeTruthy()
    expect(within(screen.getByText('Bridge').closest('tr')!).getByText('Infrastructure')).toBeTruthy()

    await user.click(screen.getByRole('combobox', { name: 'Kind' }))
    await user.click(screen.getByRole('option', { name: 'Group' }))
    await flush()
    expect(api.listRooms).toHaveBeenLastCalledWith({ kind: 'group', access: undefined })
    expect(screen.queryByText('Alice DM')).toBeNull()
    await user.click(screen.getByRole('combobox', { name: 'Access' }))
    await user.click(screen.getByRole('option', { name: 'denied' }))
    await flush()
    expect(api.listRooms).toHaveBeenLastCalledWith({ kind: 'group', access: 'denied' })
  })

  test('saves room settings', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.setRoomSettings.mockRejectedValueOnce(Object.assign(new Error('bad preset'), { code: 'validation_error' }))
    mount()
    await flush()
    await user.click(screen.getByText('Alice DM'))
    await flush()
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByText('Alice')).toBeTruthy()
    expect(within(drawer).getByText('@fb_1:hs')).toBeTruthy()
    expect(within(drawer).getByText('1001')).toBeTruthy()
    await user.click(within(drawer).getByRole('combobox', { name: 'Preset' }))
    await user.click(screen.getByRole('option', { name: /Preset One/ }))
    await user.click(within(drawer).getByRole('combobox', { name: 'Trigger' }))
    await user.click(screen.getByRole('option', { name: 'Only when mentioned' }))
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await flush()
    expect(api.setRoomSettings).toHaveBeenCalledWith('!a', { preset_id: 'p1', trigger: 'mention' })
    expect(within(drawer).getByText(/validation_error: bad preset/)).toBeTruthy()
    api.setRoomSettings.mockResolvedValueOnce(detail(rooms[0]))
    await user.click(within(drawer).getByRole('combobox', { name: 'Preset' }))
    await user.click(screen.getByRole('option', { name: 'Default preset' }))
    await user.click(within(drawer).getByRole('button', { name: 'Save' }))
    await flush()
    expect(api.setRoomSettings).toHaveBeenLastCalledWith('!a', { preset_id: null, trigger: 'mention' })
  })

  test('allows and denies a room', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.addRule.mockResolvedValue({})
    mount()
    await flush()
    await user.click(screen.getByText('Alice DM'))
    await flush()
    let drawer = screen.getByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Allow room' }))
    expect(api.addRule).not.toHaveBeenCalled()
    await user.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Allow' }))
    await flush(500)
    expect(api.addRule).toHaveBeenLastCalledWith({ list: 'allow', kind: 'room', value: '!a' })
    await user.click(within(drawer).getByRole('button', { name: 'Deny room' }))
    await user.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Deny' }))
    await flush(500)
    expect(api.addRule).toHaveBeenLastCalledWith({ list: 'deny', kind: 'room', value: '!a' })
    await user.keyboard('{Escape}')
    await flush()

    for (const name of ['Crew', 'Bridge']) {
      await user.click(screen.getByText(name))
      await flush()
      drawer = screen.getByRole('dialog')
      expect((within(drawer).getByRole('button', { name: 'Allow room' }) as HTMLButtonElement).disabled).toBe(true)
      expect((within(drawer).getByRole('button', { name: 'Deny room' }) as HTMLButtonElement).disabled).toBe(true)
      await user.keyboard('{Escape}')
      await flush()
    }
  })

  test('removes an existing room rule', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.listRules.mockResolvedValue({ allow: [{ id: 9, list: 'allow', kind: 'room', value: '!a', note: null, created_at: '2026-10-25T10:00:00Z' }], deny: [] })
    api.deleteRule.mockResolvedValue(undefined)
    mount()
    await flush()
    await user.click(screen.getByText('Alice DM'))
    await flush()
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).queryByRole('button', { name: 'Allow room' })).toBeNull()
    await user.click(within(drawer).getByRole('button', { name: 'Remove rule' }))
    await user.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Remove' }))
    await flush()
    expect(api.deleteRule).toHaveBeenCalledWith(9)
  })

  test('shows recent messages', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.listRoomMessages.mockImplementation(async (_id: string, o: { beforeId?: string } = {}) =>
      o.beforeId ? [msg('0', { body: 'ancient' })] : [
        msg('2', { direction: 'out', body: 'agent reply', sender_name: 'Bot', status: 'failed', reason: 'boom' }),
        msg('1', { body: null, status: 'ignored', reason: 'not mentioned' }),
        ...Array.from({ length: 48 }, (_, i) => msg(`f${i}`)),
      ])
    mount()
    await flush()
    await user.click(screen.getByText('Alice DM'))
    await flush()
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByText('agent reply')).toBeTruthy()
    expect(within(drawer).getByText('not stored')).toBeTruthy()
    expect(within(drawer).getByLabelText('failed: boom')).toBeTruthy()
    expect(within(drawer).getByLabelText('ignored: not mentioned')).toBeTruthy()
    expect(within(drawer).getByText('Bot')).toBeTruthy()
    await user.click(within(drawer).getByRole('button', { name: 'Load older' }))
    await flush()
    expect(api.listRoomMessages).toHaveBeenLastCalledWith('!a', { limit: 50, beforeId: 'f47' })
    expect(within(drawer).getByText('ancient')).toBeTruthy()
  })

  test('warns on unhealthy sync', async () => {
    api.getMeta.mockResolvedValue({ user_id: '@bot:hs', sync: { healthy: false, last_sync_at: null }, default_policy: 'deny', group_trigger: 'mention', homeserver_url: 'h', rule_kinds: {} })
    mount()
    await flush()
    expect(screen.getByText('@bot:hs')).toBeTruthy()
    expect(screen.getByText(/sync is unhealthy/i)).toBeTruthy()
  })
})
