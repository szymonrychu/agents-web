// @vitest-environment jsdom
// The selected project narrows every list that shows a Project column or offers presets.
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import { ChatsPage } from '../matrix/ChatsPage'
import { SchedulesPage } from '../schedules/SchedulesPage'
import { NewSessionDialog } from '../sessions/NewSessionDialog'
import { theme } from '../theme'
import { PresetSelect, usePresetIndex } from '../triggers'
import { EndpointsList } from '../webhooks/EndpointsList'
import { useSessions } from '../ribbon/useSessions'
import { sessionVisibleIn } from './scope'

const ctx = vi.hoisted(() => ({ project: null as string | null }))
vi.mock('./ProjectContext', () => ({ useProject: () => ({ project: ctx.project, projects: [], setProject: () => {}, refreshProjects: () => {} }) }))
const client = vi.hoisted(() => ({ listPresets: vi.fn(), listSessions: vi.fn(), listAgents: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client, statusStreamUrl: () => '/s' }))
vi.mock('../api/stream', async (orig) => ({ ...(await orig<typeof import('../api/stream')>()), openStream: () => ({ close: () => {} }) }))
const sched = vi.hoisted(() => ({ listSchedules: vi.fn(), listScheduleRuns: vi.fn() }))
vi.mock('../schedules/api', async (orig) => ({ ...(await orig<typeof import('../schedules/api')>()), ...sched }))
const hooks = vi.hoisted(() => ({ listEndpoints: vi.fn(), getMeta: vi.fn() }))
vi.mock('../webhooks/api', async (orig) => ({ ...(await orig<typeof import('../webhooks/api')>()), ...hooks }))
const matrix = vi.hoisted(() => ({ getMeta: vi.fn(), listRooms: vi.fn(), listRules: vi.fn(), getSettings: vi.fn() }))
vi.mock('../matrix/api', async (orig) => ({ ...(await orig<typeof import('../matrix/api')>()), ...matrix }))

const PRESETS = [
  { id: 'pa', name: 'Alpha preset', project: 'alpha', is_default: false },
  { id: 'pb', name: 'Beta preset', project: 'beta', is_default: false },
]
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
const session = (id: string, project: string, superleader = false) =>
  ({ id, slug: id, project, desired: 'active', status: {}, summary: { state: 'idle', ready: 1, replicas: 1 }, spec: superleader ? { session_messaging: true } : {} }) as unknown as SessionView

beforeEach(() => {
  ctx.project = 'alpha'
  for (const f of [...Object.values(client), ...Object.values(sched), ...Object.values(hooks), ...Object.values(matrix)]) f.mockReset()
  client.listPresets.mockImplementation(async (project?: string | null) => PRESETS.filter((p) => !project || p.project === project))
  client.listAgents.mockResolvedValue([])
})
afterEach(cleanup)

describe('project filter', () => {
  test('sessions: only the selected project, superleader sessions stay visible', async () => {
    client.listSessions.mockResolvedValue([session('a1', 'alpha'), session('b1', 'beta'), session('s1', 'beta', true)])
    const { result } = renderHook(() => useSessions('alpha'))
    await waitFor(() => expect(result.current.state.loaded).toBe(true))
    const expected = ['a1', 's1']
    expect(result.current.sessions.map((e) => e.session.id)).toEqual(expected)
    expect(Object.keys(result.current.state.sessions)).toEqual(expected)
  })

  test('sessions: all projects when none is selected', () => {
    expect(sessionVisibleIn(session('b1', 'beta'), null)).toBe(true)
    expect(sessionVisibleIn(session('b1', 'beta'), 'alpha')).toBe(false)
    expect(sessionVisibleIn(session('s1', 'beta', true), 'alpha')).toBe(true)
    expect(sessionVisibleIn(session('s2', 'gamma', true), 'beta')).toBe(true)
  })

  test('schedules', async () => {
    client.listPresets.mockResolvedValue(PRESETS)
    const s = (id: string, name: string, preset_id: string) => ({ id, name, cron: '* * * * *', timezone: 'UTC', preset_id, prompt: 'x', enabled: true, next_fires: [], last_run: null })
    sched.listSchedules.mockResolvedValue([s('1', 'Mine', 'pa'), s('2', 'Theirs', 'pb')])
    wrap(<SchedulesPage onBack={() => {}} />)
    await screen.findByText('Mine')
    expect(screen.queryByText('Theirs')).toBeNull()
  })

  test('webhooks', async () => {
    client.listPresets.mockResolvedValue(PRESETS)
    hooks.getMeta.mockResolvedValue({ filter_fields: {} })
    const e = (id: number, preset_id: string) => ({ id, suffix: `s${id}`, url: `https://h/webhook/s${id}`, type: 'github-pr', preset_id, prompt_template: null, filters: { allow: [], deny: [] }, last_event_at: null, created_at: '2026-01-01T00:00:00Z', auth_mode: 'basic' })
    hooks.listEndpoints.mockResolvedValue([e(1, 'pa'), e(2, 'pb')])
    wrap(<EndpointsList refreshKey={0} onChanged={() => {}} />)
    await screen.findByText('https://h/webhook/s1')
    expect(screen.queryByText('https://h/webhook/s2')).toBeNull()
  })

  test('chats', async () => {
    client.listPresets.mockResolvedValue(PRESETS)
    matrix.getMeta.mockResolvedValue({ user_id: '@bot:hs', sync: { healthy: true, last_sync_at: null } })
    matrix.listRules.mockResolvedValue({ allow: [], deny: [] })
    matrix.getSettings.mockResolvedValue({ default_preset_id: null, preamble: null, default_preamble: 'D' })
    const r = (id: string, preset_id: string) => ({ room_id: id, alias: null, name: `Room ${id}`, kind: 'dm', membership: 'join', encrypted: false, message_request: false, member_count: 2, access: { state: 'allowed', reason: 'x', rule_id: 1 }, preset_id, trigger: null, effective_preset_id: preset_id, effective_trigger: 'all', queued: 0, last_event_at: null, session: null, agents_may_initiate: false, anonymize_names: false, binding: null, pending: { allowed: true, denied_count: 0, denied_senders: [], invited: false, inviter: null, last_denied_at: null, message_request: false } })
    matrix.listRooms.mockResolvedValue([r('!a', 'pa'), r('!b', 'pb')])
    wrap(<ChatsPage onBack={() => {}} onOpenSession={() => {}} />)
    await screen.findByText('Room !a')
    expect(screen.queryByText('Room !b')).toBeNull()
  })

  test('PresetSelect lists only the selected project presets', async () => {
    wrap(<PresetSelect value="" onChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('combobox').getAttribute('aria-disabled')).not.toBe('true'))
    expect(client.listPresets).toHaveBeenCalledWith('alpha')
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: 'Alpha preset' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Beta preset' })).toBeNull()
  })

  test('NewSessionDialog lists only the selected project presets', async () => {
    wrap(<NewSessionDialog open onClose={() => {}} onCreated={() => {}} />)
    await waitFor(() => expect(client.listPresets).toHaveBeenCalledWith('alpha'))
    await userEvent.click(await screen.findByRole('combobox', { name: 'Preset' }))
    expect(await screen.findByRole('option', { name: 'Alpha preset' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Beta preset' })).toBeNull()
  })

  test('the preset index reloads when the window regains focus', async () => {
    client.listPresets.mockResolvedValue(PRESETS)
    const { result } = renderHook(() => usePresetIndex())
    await waitFor(() => expect(result.current.pa).toBeTruthy())
    client.listPresets.mockResolvedValue([{ id: 'pn', name: 'New', project: 'alpha' }])
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(result.current.pn).toBeTruthy())
  })
})
