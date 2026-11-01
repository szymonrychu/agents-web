import { describe, expect, test } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { agentIssue, preparingProgress, sessionIssue, sessionMarkState } from './sessionStatus'
import { agentMark } from './stateMark'

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

const fail = { step: 'install_plugins', status: 'failed', message: 'boom', started_at: null, finished_at: null }
const aview = (over: Record<string, unknown> = {}): AgentView => ({ id: 'a1', state: 'idle', ready: true, gone: false, attention: null, bootstrap: null, bootstrap_failure: null, ...over }) as unknown as AgentView

describe('attention and bootstrap fields', () => {
  test('agent.attention gives the attention mark, a bootstrap failure the error mark', () => {
    expect(agentMark(aview({ state: 'busy', attention: { reason: 'permission', since: null } }))).toBe('attention')
    expect(agentMark(aview({ bootstrap_failure: fail }))).toBe('error')
    expect(agentMark(aview({ bootstrap_failure: fail, attention: { reason: 'dialog', since: null } }))).toBe('error')
    expect(agentMark(aview({ ready: false, attention: { reason: 'dialog', since: null } }))).toBe('booting')
  })
  test('agentIssue names the failed step and message or the attention reason', () => {
    expect(agentIssue(aview({ bootstrap_failure: fail }))).toEqual({ kind: 'bootstrap_failure', text: 'install_plugins failed: boom' })
    expect(agentIssue(aview({ attention: { reason: 'question', since: null } }))).toEqual({ kind: 'attention', text: 'waiting: question' })
    expect(agentIssue(aview())).toBeNull()
  })
  test('session mark: summary counts and agents', () => {
    expect(sessionMarkState(session({}, { state: 'working', attention_agents: 1 }), [])).toBe('attention')
    expect(sessionMarkState(session({}, { state: 'working', bootstrap_failed_agents: 1, attention_agents: 1 }), [])).toBe('error')
    expect(sessionMarkState(session(), [aview({ bootstrap_failure: fail })])).toBe('error')
    expect(sessionMarkState(session({ desired: 'deleting' }, { bootstrap_failed_agents: 1 }), [])).toBe('deleting')
  })
  test('sessionIssue prefers the agent step text, falls back to counts', () => {
    expect(sessionIssue(session(), [aview({ bootstrap_failure: fail })])).toEqual({ kind: 'bootstrap_failure', text: 'install_plugins failed: boom' })
    expect(sessionIssue(session({}, { bootstrap_failed_agents: 2 }), [])).toEqual({ kind: 'bootstrap_failure', text: '2 agents failed to bootstrap' })
    expect(sessionIssue(session({}, { attention_agents: 1 }), [])).toEqual({ kind: 'attention', text: '1 agent waiting for input' })
    expect(sessionIssue(session(), [aview({ attention: { reason: 'dialog', since: null } })])).toEqual({ kind: 'attention', text: 'waiting: dialog' })
    expect(sessionIssue(session(), [aview()])).toBeNull()
  })
  test('unavailable permission mode: reason from the agent, count fallback, absent otherwise', () => {
    const unavailable = aview({ permission_mode_state: 'unavailable', permission_mode_reason: 'auto mode is unavailable for your plan' })
    expect(agentIssue(unavailable)).toEqual({ kind: 'permission_unavailable', text: 'Auto mode unavailable: auto mode is unavailable for your plan' })
    expect(agentIssue(aview({ permission_mode_state: 'unavailable' }))).toEqual({ kind: 'permission_unavailable', text: 'Auto mode unavailable' })
    expect(agentIssue(aview({ permission_mode_state: null, permission_mode_reason: 'stale' }))).toBeNull()
    expect(sessionIssue(session(), [unavailable])).toEqual({ kind: 'permission_unavailable', text: 'Auto mode unavailable: auto mode is unavailable for your plan' })
    expect(sessionIssue(session({}, { permission_unavailable_agents: 2 }), [])).toEqual({ kind: 'permission_unavailable', text: 'Auto mode unavailable on 2 agents' })
    expect(sessionIssue(session({}, { permission_unavailable_agents: 0 }), [])).toBeNull()
    expect(sessionIssue(session({}, { bootstrap_failed_agents: 1, permission_unavailable_agents: 1 }), [])?.kind).toBe('bootstrap_failure')
  })
  test('preparing label shows the current bootstrap step', () => {
    const s = session({ status: { phase: 'pending' } }, { ready: 0, replicas: 1 })
    const a = aview({ ready: false, bootstrap: { step: 'install_plugins', status: 'running', message: null, started_at: null, finished_at: null } })
    expect(preparingProgress(s, [a])?.label).toBe('0 of 1 agents ready, bootstrap: install_plugins')
    expect(preparingProgress(s, [])?.label).toBe('0 of 1 agents ready')
  })
})
