// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { SessionsPage } from './SessionsPage'

const api = vi.hoisted(() => ({ listSessions: vi.fn(), deleteSession: vi.fn(), getMeta: vi.fn(), createSession: vi.fn(), listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

vi.mock('./NewSessionDialog', () => ({
  NewSessionDialog: (p: { open: boolean; onClose: () => void; onCreated: (c: SessionView) => void }) =>
    p.open ? (
      <div role="dialog" aria-label="New session stub">
        <button onClick={() => p.onCreated(session('c-new', 'fresh', null))}>Create</button>
        <button onClick={p.onClose}>Close</button>
      </div>
    ) : null,
}))

const session = (id: string, slug: string, closes_at: string | null, preset_name: string | null = 'Default'): SessionView =>
  ({
    closes_at, created_at: '2026-01-01T10:00:00Z', desired: 'active', generation: 1, id, observed_generation: 1, preset_name, slug, spec: {}, status: {},
    summary: { auto_compact_pct: 80, context_pct_max: 10, failed: 0, queued: 0, ready: 2, replicas: 3, state: 'working' },
  }) as unknown as SessionView

const NOW = new Date('2026-01-01T12:00:00Z').getTime()
const LIST = [session('c1', 'alpha', '2026-01-01T14:30:00Z'), session('c2', 'beta', null, null)]

const wrap = (onBack = vi.fn(), onOpen = vi.fn()) => ({ onBack, onOpen, ...render(<ThemeProvider theme={theme}><SessionsPage onBack={onBack} onOpen={onOpen} /></ThemeProvider>) })
const row = (slug: string) => screen.getAllByRole('listitem').find((r) => within(r).queryByRole('button', { name: `Open ${slug}` }))!

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  Object.values(api).forEach((f) => f.mockReset())
  api.listSessions.mockResolvedValue(LIST)
  api.deleteSession.mockResolvedValue(LIST[0])
  api.getMeta.mockResolvedValue({ discard_hook: 'none' })
  api.listPresets.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SessionsPage', () => {
  test('lists sessions', async () => {
    wrap()
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeTruthy()
    await screen.findByText('alpha')
    const a = row('alpha')
    for (const t of ['alpha', 'Default', 'working', '2/3', '2h 30m left']) expect(within(a).getByText(t)).toBeTruthy()
    expect(within(a).getByText(new Date('2026-01-01T10:00:00Z').toLocaleString())).toBeTruthy()
    const b = row('beta')
    expect(within(b).getByText('never')).toBeTruthy()
    expect(within(b).getByText('none')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
    expect(screen.queryByText('No sessions yet')).toBeNull()
    cleanup()
    api.listSessions.mockResolvedValue([])
    wrap()
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
  })

  test('list error shows no empty state', async () => {
    api.listSessions.mockRejectedValue(new Error('boom'))
    wrap()
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
    expect(screen.queryByText('No sessions yet')).toBeNull()
  })

  test('actions', async () => {
    const user = userEvent.setup()
    const { onOpen } = wrap()
    await screen.findByText('alpha')
    await user.click(within(row('alpha')).getByRole('button', { name: 'Open alpha' }))
    expect(onOpen).toHaveBeenCalledWith('c1')

    await user.click(screen.getByRole('button', { name: 'New session' }))
    expect(screen.getByRole('dialog', { name: 'New session stub' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2))

    await user.click(within(row('alpha')).getByRole('button', { name: 'Discard alpha' }))
    await user.type(await screen.findByLabelText('Type the slug to confirm'), 'alpha')
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(3))
  })
})
