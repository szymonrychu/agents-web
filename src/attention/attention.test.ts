import { describe, expect, test } from 'vitest'
import type { SessionView } from '../api/client'
import type { SessionEntry } from '../ribbon/useSessions'
import { decision, task } from '../tasks/testUtils'
import { attentionOf, groupOpenDecisions, openDecisionsOf } from './attention'

const entry = (id: string, over: Partial<SessionEntry> = {}, summary: Record<string, unknown> = {}): SessionEntry => ({
  session: { id, slug: id, desired: 'active', status: {}, spec: {}, summary: { state: 'waiting', ready: 1, replicas: 1, ...summary } } as unknown as SessionView,
  agents: {},
  ...over,
})

describe('groupOpenDecisions', () => {
  test('counts open decisions per asking session', () => {
    const t1 = task({ key: 'T-1', decisions: [decision({ id: 1, asking_session: 's1' }), decision({ id: 2, asking_session: 's2' })] })
    const t2 = task({ key: 'T-2', decisions: [decision({ id: 3, asking_session: 's1' })] })
    const g = groupOpenDecisions([t1, t2])
    expect(g.get('s1')).toEqual({ decisions: 2, tasks: [t1, t2] })
    expect(g.get('s2')).toEqual({ decisions: 1, tasks: [t1] })
  })

  test('ignores answered and withdrawn decisions', () => {
    const t = task({ decisions: [decision({ id: 1, status: 'answered' }), decision({ id: 2, status: 'withdrawn' })] })
    expect(groupOpenDecisions([t]).size).toBe(0)
  })

  test('lists a task once per session even with several open decisions', () => {
    const t = task({ decisions: [decision({ id: 1 }), decision({ id: 2 }), decision({ id: 3 })] })
    expect(groupOpenDecisions([t]).get('s1')).toEqual({ decisions: 3, tasks: [t] })
  })
})

describe('openDecisionsOf', () => {
  test('openDecisionsOf filters by session and status', () => {
    const t = task({ decisions: [decision({ id: 1 }), decision({ id: 2, asking_session: 's2' }), decision({ id: 3, status: 'answered' }), decision({ id: 4 })] })
    expect(openDecisionsOf(t, 's1').map((d) => d.id)).toEqual([1, 4])
  })
})

describe('attentionOf', () => {
  test('attentionOf marks prompt-only sessions with decisions 0 and prompt true', () => {
    const t = task({ decisions: [decision({ asking_session: 'a' })] })
    const result = attentionOf([entry('a'), entry('b', {}, { attention_agents: 1 }), entry('c')], groupOpenDecisions([t]))
    expect(result.get('a')).toEqual({ decisions: 1, tasks: [t], prompt: false })
    expect(result.get('b')).toEqual({ decisions: 0, tasks: [], prompt: true })
    expect(result.has('c')).toBe(false)
  })

  test('attentionOf skips discarded sessions', () => {
    const t = task({ decisions: [decision({ asking_session: 'a' })] })
    const result = attentionOf([entry('a', { discarded: true }, { attention_agents: 1 })], groupOpenDecisions([t]))
    expect(result.size).toBe(0)
  })

  test('attentionOf ignores decisions of sessions that are not listed', () => {
    const t = task({ decisions: [decision({ asking_session: 'elsewhere' })] })
    expect(attentionOf([entry('a')], groupOpenDecisions([t])).size).toBe(0)
  })
})
