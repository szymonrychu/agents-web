import { describe, expect, test } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { preparingProgress, sessionMarkState } from './sessionStatus'

const session = (over: Record<string, unknown> = {}, summary: Record<string, unknown> = {}): SessionView =>
  ({ id: 's1', slug: 'a', desired: 'active', status: {}, summary: { state: 'waiting', ready: 1, replicas: 1, ...summary }, ...over }) as unknown as SessionView
const agent = (state: string, ready = true): AgentView => ({ id: state, state, ready, gone: false }) as unknown as AgentView

describe('sessionMarkState', () => {
  test('summary waiting means all idle, not waiting for input', () => {
    expect(sessionMarkState(session(), [agent('idle')])).toBe('idle')
  })
  test('maps the summary states', () => {
    expect(sessionMarkState(session({}, { state: 'working' }), [])).toBe('working')
    expect(sessionMarkState(session({}, { state: 'booting' }), [])).toBe('booting')
    expect(sessionMarkState(session({}, { state: 'error' }), [])).toBe('error')
    expect(sessionMarkState(session({}, { state: 'deleting' }), [])).toBe('deleting')
  })
  test('desired deleting is deleting; discarded wins over everything', () => {
    expect(sessionMarkState(session({ desired: 'deleting' }, { state: 'working' }), [])).toBe('deleting')
    expect(sessionMarkState(session({ desired: 'deleting' }), [], true)).toBe('discarded')
  })
  test('an agent in the typed waiting state raises attention above working but not error', () => {
    expect(sessionMarkState(session({}, { state: 'working' }), [agent('busy'), agent('waiting')])).toBe('attention')
    expect(sessionMarkState(session({}, { state: 'error' }), [agent('waiting')])).toBe('error')
  })
  test('a session still preparing is booting even when pods report idle', () => {
    expect(sessionMarkState(session({ status: { phase: 'pending' } }), [agent('idle')])).toBe('booting')
  })
})

describe('preparingProgress', () => {
  test('null when ready', () => {
    expect(preparingProgress(session({ status: { phase: 'ready' } }))).toBeNull()
    expect(preparingProgress(session())).toBeNull()
  })
  test('gate running is indeterminate and uses the status message', () => {
    const p = preparingProgress(session({ status: { phase: 'pending', message: 'cache restore running', cache: { restore: { state: 'running' } } } }, { ready: 0, replicas: 2 }))
    expect(p).toEqual({ kind: 'preparing', label: 'cache restore running', value: null })
  })
  test('init running without a message gets a derived label', () => {
    const p = preparingProgress(session({ status: { phase: 'pending', init: { state: 'running' } } }, { ready: 0 }))
    expect(p).toEqual({ kind: 'preparing', label: 'init running', value: null })
  })
  test('only pods booting is determinate by ready over replicas', () => {
    const p = preparingProgress(session({ status: { phase: 'pending' } }, { ready: 1, replicas: 4 }))
    expect(p).toEqual({ kind: 'preparing', label: '1 of 4 agents ready', value: 25 })
  })
  test('a running gate with phase not pending still counts', () => {
    const p = preparingProgress(session({ status: { phase: 'degraded', cache: { sessions_restore: { state: 'running' } } } }))
    expect(p?.label).toBe('sessions restore running')
  })
  test('deleting shows discard progress with the message', () => {
    const p = preparingProgress(session({ desired: 'deleting', status: { phase: 'deleting', message: 'saving the workspace cache' } }))
    expect(p).toEqual({ kind: 'discarding', label: 'saving the workspace cache', value: null })
    expect(preparingProgress(session({ desired: 'deleting' }))?.label).toBe('discarding')
  })
  test('error phase is not preparing', () => {
    expect(preparingProgress(session({ status: { phase: 'error', init: { state: 'failed' } } }))).toBeNull()
  })
})
