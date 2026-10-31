import { describe, expect, test } from 'vitest'
import { validateHooks } from './validate'
import type { HookAction, HookEventInfo, Hooks } from './types'

const events: HookEventInfo[] = [
  { name: 'onTurn', supports_matcher: false, supports_interval: false },
  { name: 'onTick', supports_matcher: false, supports_interval: true },
  { name: 'onAgentToolCall', supports_matcher: true, supports_interval: false },
]
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
  test('interval and when only on onTick, interval required there', () => {
    expect(errs({ onTurn: [cmd({ interval_seconds: 5, when: 'busy' })] })).toEqual([
      'onTurn.0.interval_seconds: only allowed on onTick',
      'onTurn.0.when: only allowed on onTick',
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
})
