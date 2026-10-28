import { describe, expect, test } from 'vitest'
import { agentMarkState } from './stateMark'

describe('agentMarkState', () => {
  test('maps dead to error', () => {
    expect(agentMarkState('dead', true)).toBe('error')
    expect(agentMarkState('dead', false)).toBe('error')
  })

  test('maps the other wrapper states', () => {
    expect(agentMarkState('idle', false)).toBe('booting')
    expect(agentMarkState('idle', true)).toBe('waiting')
    expect(agentMarkState('busy', true)).toBe('working')
    expect(agentMarkState('working', true)).toBe('working')
    expect(agentMarkState('error', true)).toBe('error')
    expect(agentMarkState('failed', true)).toBe('error')
    expect(agentMarkState('unknown', true)).toBe('booting')
    expect(agentMarkState('booting', true)).toBe('booting')
  })
})
