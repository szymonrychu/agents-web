import { describe, expect, test } from 'vitest'
import { lastTalkedSuperleader, orderSessions } from './orderSessions'
import type { SessionEntry } from './useSessions'
import type { SessionView } from '../api/client'

const NAMES: Record<string, string> = { a: 'alpha', b: 'bravo', c: 'charlie', d: 'delta', e: 'echo' }

function entry(id: string, over: { messaging?: boolean; at?: string | null; desired?: string; discarded?: true; slug?: string } = {}): SessionEntry {
  const session = {
    id,
    slug: over.slug ?? NAMES[id] ?? id,
    desired: over.desired ?? 'active',
    spec: { session_messaging: over.messaging ?? false },
    last_user_message_at: over.at ?? null,
  } as unknown as SessionView
  return { session, agents: {}, ...(over.discarded ? { discarded: true as const } : {}) }
}

const base = () => ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id))
const ids = (list: SessionEntry[]) => list.map((e) => e.session.id)
const none: ReadonlySet<string> = new Set()

describe('orderSessions', () => {
  test('no pins keeps the input order', () => {
    expect(ids(orderSessions(base(), { lastTalkedId: null, attentionIds: none }))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('last talked session goes first', () => {
    expect(ids(orderSessions(base(), { lastTalkedId: 'c', attentionIds: none }))).toEqual(['c', 'a', 'b', 'd', 'e'])
  })

  test('attention sessions follow the last talked, alphabetical among them', () => {
    expect(ids(orderSessions(base(), { lastTalkedId: 'd', attentionIds: new Set(['e', 'b']) }))).toEqual(['d', 'b', 'e', 'a', 'c'])
  })

  test('a last talked session that also needs attention appears once, first', () => {
    expect(ids(orderSessions(base(), { lastTalkedId: 'b', attentionIds: new Set(['b', 'd']) }))).toEqual(['b', 'd', 'a', 'c', 'e'])
  })

  test('unknown ids are ignored', () => {
    expect(ids(orderSessions(base(), { lastTalkedId: 'zz', attentionIds: new Set(['yy']) }))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('clearing the pins restores the original place', () => {
    const input = base()
    const pinned = orderSessions(input, { lastTalkedId: 'e', attentionIds: new Set(['c']) })
    expect(ids(pinned)).toEqual(['e', 'c', 'a', 'b', 'd'])
    expect(ids(orderSessions(input, { lastTalkedId: null, attentionIds: none }))).toEqual(ids(input))
  })

  test('does not mutate the input', () => {
    const input = base()
    orderSessions(input, { lastTalkedId: 'e', attentionIds: new Set(['c']) })
    expect(ids(input)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('lastTalkedSuperleader', () => {
  test('picks the newest superleader', () => {
    const list = [entry('a', { messaging: true, at: '2026-01-01T10:00:00Z' }), entry('b', { messaging: true, at: '2026-01-02T10:00:00Z' }), entry('c')]
    expect(lastTalkedSuperleader(list)).toBe('b')
  })

  test('ignores non-superleaders even with a newer timestamp', () => {
    const list = [entry('a', { messaging: true, at: '2026-01-01T10:00:00Z' }), entry('b', { messaging: false, at: '2026-02-01T10:00:00Z' })]
    expect(lastTalkedSuperleader(list)).toBe('a')
  })

  test('ignores null timestamps, discarded and deleting sessions', () => {
    const list = [
      entry('a', { messaging: true, at: null }),
      entry('b', { messaging: true, at: '2026-03-01T10:00:00Z', discarded: true }),
      entry('c', { messaging: true, at: '2026-03-02T10:00:00Z', desired: 'deleting' }),
      entry('d', { messaging: true, at: '2026-01-01T10:00:00Z' }),
    ]
    expect(lastTalkedSuperleader(list)).toBe('d')
  })

  test('returns null when no superleader was messaged', () => {
    expect(lastTalkedSuperleader([entry('a', { messaging: true }), entry('b', { at: '2026-01-01T10:00:00Z' })])).toBeNull()
    expect(lastTalkedSuperleader([])).toBeNull()
  })

  test('ties go to the first slug', () => {
    const at = '2026-01-01T10:00:00Z'
    const list = [entry('x', { messaging: true, at, slug: 'zeta' }), entry('y', { messaging: true, at, slug: 'beta' })]
    expect(lastTalkedSuperleader(list)).toBe('y')
  })
})
