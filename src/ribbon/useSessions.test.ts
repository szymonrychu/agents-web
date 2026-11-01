import { describe, expect, test } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { initialState, sessionsReducer, sortedSessions } from './useSessions'

const s = (id: string): SessionView => ({ id, slug: id, desired: 'active', status: {}, summary: { state: 'working', ready: 1, replicas: 1 } }) as unknown as SessionView
const a = { id: 'a0', ordinal: 0, state: 'idle', ready: true, gone: false } as unknown as AgentView

describe('sessions reducer discarded entries', () => {
  const base = sessionsReducer(initialState, { type: 'snapshot', sessions: [{ session: s('c1'), agents: [a] }, { session: s('c2'), agents: [] }] })

  test('session_removed keeps a discarded entry with its last data', () => {
    const next = sessionsReducer(base, { type: 'session_removed', sessionId: 'c1' })
    expect(next.sessions.c1.discarded).toBe(true)
    expect(next.sessions.c1.agents.a0).toBeDefined()
    expect(next.selectedId).toBe(base.selectedId)
    expect(sortedSessions(next)).toHaveLength(2)
  })

  test('unknown id is a no-op', () => {
    expect(sessionsReducer(base, { type: 'session_removed', sessionId: 'zz' })).toBe(base)
  })

  test('dismiss drops the entry and its selection', () => {
    let st = sessionsReducer(base, { type: 'select', id: 'c1' })
    st = sessionsReducer(st, { type: 'session_removed', sessionId: 'c1' })
    expect(st.selectedId).toBe('c1')
    st = sessionsReducer(st, { type: 'dismiss', id: 'c1' })
    expect(st.sessions.c1).toBeUndefined()
    expect(st.selectedId).toBeNull()
  })

  test('a snapshot keeps discarded entries the server no longer lists', () => {
    const removed = sessionsReducer(base, { type: 'session_removed', sessionId: 'c1' })
    const next = sessionsReducer(removed, { type: 'snapshot', sessions: [{ session: s('c2'), agents: [] }] })
    expect(next.sessions.c1.discarded).toBe(true)
  })

  test('a session_status for a discarded id leaves it discarded', () => {
    const removed = sessionsReducer(base, { type: 'session_removed', sessionId: 'c1' })
    const next = sessionsReducer(removed, { type: 'session_status', session: s('c1') })
    expect(next.sessions.c1.discarded).toBe(true)
  })
})
