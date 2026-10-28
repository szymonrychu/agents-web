// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { theme } from '../theme'
import { ChatView } from './ChatView'

// ChatView composes the banner with its siblings; the siblings are stubbed so the test asserts only that the banner is mounted and fed the session and agents.
vi.mock('./useSessionChat', () => ({ useSessionChat: () => ({ items: [], loading: false, loadingOlder: false, hasMoreBefore: false, error: null, loadOlder: () => undefined }) }))
vi.mock('./ChatLog', () => ({ ChatLog: () => null }))
vi.mock('./Composer', () => ({ Composer: () => null }))
vi.mock('./QueueStrip', () => ({ QueueStrip: () => null }))
vi.mock('./ScaleControl', () => ({ ScaleControl: () => null }))
vi.mock('./AgentsStrip', () => ({ AgentsStrip: () => null }))

afterEach(cleanup)

const agent = (state: AgentView['state'], ready: boolean): AgentView =>
  ({ id: 'a0', ordinal: 0, ready, state, leader: false, gone: false, peers: 0, pod_name: 'alpha-0' }) as unknown as AgentView

const session = (queued: number): SessionView =>
  ({
    id: 'c1',
    slug: 'alpha',
    desired: 'active',
    spec: { replicas: 1 },
    status: {},
    summary: { auto_compact_pct: 80, context_pct_max: null, failed: 0, oldest_queued_at: new Date().toISOString(), queued, ready: 0, replicas: 1, state: 'waiting' },
  }) as unknown as SessionView

const mount = (s: SessionView, agents: AgentView[]) =>
  render(
    <ThemeProvider theme={theme}>
      <ChatView session={s} agents={agents} />
    </ThemeProvider>,
  )

describe('ChatView', () => {
  test('mounts the agent unavailable banner', () => {
    mount(session(2), [agent('dead', false)])
    expect(screen.getByRole('alert').textContent).toMatch(/^Agent unavailable: 2 messages queued/)
  })

  test('shows no banner while an agent is alive', () => {
    mount(session(2), [agent('idle', true)])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
