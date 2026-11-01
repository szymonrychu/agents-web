// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { statusEventFromFrame } from '../api/stream'
import { initialState, sessionsReducer } from '../ribbon/useSessions'
import { theme } from '../theme'
import { AgentUnavailableBanner } from './AgentUnavailableBanner'

const NOW = new Date('2026-01-01T01:00:00Z')
const minutesAgo = (m: number): string => new Date(NOW.getTime() - m * 60000).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const agent = (id: string, ordinal: number, o: Partial<AgentView> = {}): AgentView => ({
  context: { used_percentage: 25, used_tokens: 1, window_tokens: 4 }, current_turn_id: null, free_since: null, gone: false, id, ordinal, leader: false, context_pct: null, peers: 0, pod_name: `alpha-${ordinal}`, ready: true, state: 'busy', attention: null, bootstrap: null, bootstrap_failure: null, ...o,
})

const session = (summary: Partial<SessionView['summary']> = {}): SessionView =>
  ({
    id: 'c1',
    slug: 'alpha',
    summary: { auto_compact_pct: 80, context_pct_max: null, failed: 0, oldest_queued_at: null, queued: 0, ready: 1, replicas: 1, state: 'working', ...summary },
  }) as unknown as SessionView

const mount = (s: SessionView, agents: AgentView[]) =>
  render(
    <ThemeProvider theme={theme}>
      <AgentUnavailableBanner session={s} agents={agents} />
    </ThemeProvider>,
  )

describe('AgentUnavailableBanner', () => {
  test('shows when messages are queued and no agent is alive', () => {
    mount(session({ queued: 3, oldest_queued_at: minutesAgo(2) }), [agent('a0', 0, { state: 'dead' }), agent('a1', 1, { ready: false, state: 'idle' })])
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 3 messages queued, oldest 2m ago')
    cleanup()
    mount(session({ queued: 1, oldest_queued_at: minutesAgo(0.75) }), [])
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 1 message queued, oldest 45s ago')
  })

  test('shows when the oldest queued message is older than 10 minutes', () => {
    mount(session({ queued: 2, oldest_queued_at: minutesAgo(10.5) }), [agent('a0', 0, { state: 'busy' })])
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 2 messages queued, oldest 10m ago')
  })

  test('hidden when a ready agent is busy and the queue is younger than 10 minutes', () => {
    mount(session({ queued: 2, oldest_queued_at: minutesAgo(10) }), [agent('a0', 0, { state: 'busy' })])
    expect(screen.queryByRole('alert')).toBeNull()
    // the clock moving past 10 minutes surfaces the stuck busy agent
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 2 messages queued, oldest 10m ago')
  })

  test('hidden when an agent is ready and idle', () => {
    mount(session({ queued: 1, oldest_queued_at: minutesAgo(1) }), [agent('a0', 0, { state: 'dead' }), agent('a1', 1, { state: 'idle' })])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('hidden when nothing is queued', () => {
    mount(session({ queued: 0, oldest_queued_at: null }), [agent('a0', 0, { state: 'dead' })])
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    mount(session({ queued: 0, oldest_queued_at: null }), [])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('updates the age from the status stream', () => {
    const agents = [agent('a0', 0, { state: 'dead' })]
    let state = sessionsReducer(initialState, { type: 'snapshot', sessions: [{ session: session({ queued: 2, oldest_queued_at: minutesAgo(5) }), agents }] })
    const view = () => (
      <ThemeProvider theme={theme}>
        <AgentUnavailableBanner session={state.sessions.c1.session} agents={Object.values(state.sessions.c1.agents)} />
      </ThemeProvider>
    )
    const { rerender } = render(view())
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 2 messages queued, oldest 5m ago')
    // the oldest message was delivered: the next oldest is younger and one message is left
    state = sessionsReducer(state, statusEventFromFrame('message_status', { session_id: 'c1', queued: 1, failed: 0, oldest_queued_at: minutesAgo(3), messages: [] })!)
    rerender(view())
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 1 message queued, oldest 3m ago')
    // the clock keeps the age fresh between frames
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(screen.getByRole('alert').textContent).toBe('Agent unavailable: 1 message queued, oldest 4m ago')
    state = sessionsReducer(state, statusEventFromFrame('message_status', { session_id: 'c1', queued: 0, failed: 0, oldest_queued_at: null, messages: [] })!)
    rerender(view())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
