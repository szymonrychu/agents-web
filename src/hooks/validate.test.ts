import { describe, expect, test } from 'vitest'
import { validateHooks } from './validate'
import { HOOK_EVENTS_FIXTURE } from './testEvents'
import type { HookAction, HookEventInfo, Hooks } from './types'

const events: HookEventInfo[] = HOOK_EVENTS_FIXTURE
const cmd = (o: Partial<HookAction> = {}): HookAction => ({ type: 'command', run: 'echo', ...o }) as HookAction
const errs = (h: Hooks | null) => validateHooks(h, events).map((e) => `${e.path}: ${e.message}`)

describe('validateHooks', () => {
  test('unset and empty are valid', () => {
    expect(errs(null)).toEqual([])
    expect(errs({})).toEqual([])
  })
  test('unknown event', () => {
    expect(errs({ onBogus: [cmd()] })).toEqual(['onBogus: unknown hook event'])
  })
  test('at most 20 actions per event', () => {
    expect(errs({ onTurn: Array.from({ length: 20 }, () => cmd()) })).toEqual([])
    expect(errs({ onTurn: Array.from({ length: 21 }, () => cmd()) })).toEqual(['onTurn: has 21 actions, at most 20'])
  })
  test('matcher only on tool events', () => {
    expect(errs({ onTurn: [cmd({ matcher: 'Bash' })] })).toEqual(['onTurn.0.matcher: only allowed on onAgentToolCall'])
    expect(errs({ onAgentToolCall: [cmd({ matcher: 'Bash' })] })).toEqual([])
  })
  test('interval and when follow supports_interval, supports_when and interval_required of the event', () => {
    const custom: HookEventInfo[] = [{ name: 'onEvery', can_veto: false, supports_matcher: false, supports_interval: true, supports_when: false, interval_required: false }]
    const run = (h: Hooks) => validateHooks(h, custom).map((e) => `${e.path}: ${e.message}`)
    expect(run({ onEvery: [cmd()] })).toEqual([])
    expect(run({ onEvery: [cmd({ interval_seconds: 5 })] })).toEqual([])
    expect(run({ onEvery: [cmd({ interval_seconds: 5, when: 'busy' })] })).toEqual(['onEvery.0.when: not allowed on onEvery'])
  })
  test('interval and when only on onTick, interval required there', () => {
    expect(errs({ onTurn: [cmd({ interval_seconds: 5, when: 'busy' })] })).toEqual([
      'onTurn.0.interval_seconds: not allowed on onTurn',
      'onTurn.0.when: not allowed on onTurn',
    ])
    expect(errs({ onTick: [cmd()] })).toEqual(['onTick.0.interval_seconds: required on onTick'])
    expect(errs({ onTick: [cmd({ interval_seconds: 5, when: 'always' })] })).toEqual([])
  })
  test('command run is required and at most 16384 characters', () => {
    expect(errs({ onTurn: [cmd({ run: '' } as Partial<HookAction>)] })).toEqual(['onTurn.0.run: required'])
    expect(errs({ onTurn: [cmd({ run: 'x'.repeat(16385) } as Partial<HookAction>)] })).toEqual(['onTurn.0.run: at most 16384 characters'])
    expect(errs({ onTurn: [cmd({ run: 'x'.repeat(16384) } as Partial<HookAction>)] })).toEqual([])
  })
  test('command env keys match [A-Z_][A-Z0-9_]*', () => {
    expect(errs({ onTurn: [cmd({ env: { good_1: 'x', OK_1: 'y' } } as Partial<HookAction>)] })).toEqual(['onTurn.0.env: keys must match [A-Z_][A-Z0-9_]*: good_1'])
  })
  test('webhook url must be http or https', () => {
    const hook = (url: string) => ({ type: 'webhook', url }) as HookAction
    expect(errs({ onTurn: [hook('ftp://x')] })).toEqual(['onTurn.0.url: must be an http or https URL'])
    expect(errs({ onTurn: [hook('https://x.example/h')] })).toEqual([])
  })

  test('matcher must compile as a regex', () => {
    expect(errs({ onAgentToolCall: [cmd({ matcher: '(' })] })).toEqual([expect.stringMatching(/^onAgentToolCall\.0\.matcher: invalid regex/)])
  })
  test('timeout and interval must be above zero, retries not negative', () => {
    expect(errs({ onTick: [cmd({ interval_seconds: 0, timeout_seconds: 0 })] })).toEqual([
      'onTick.0.interval_seconds: must be greater than 0',
      'onTick.0.timeout_seconds: must be greater than 0',
    ])
    expect(errs({ onTurn: [{ type: 'webhook', url: 'http://x', retries: -1 } as HookAction] })).toEqual(['onTurn.0.retries: must be 0 or more'])
  })
})
