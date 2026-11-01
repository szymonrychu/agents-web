import { describe, expect, test } from 'vitest'
import { TOKENS } from '../theme'
import { agentMarkState, markColour, markLabel } from './stateMark'

describe('agentMarkState', () => {
  test('maps dead to error', () => {
    expect(agentMarkState('dead', true)).toBe('error')
    expect(agentMarkState('dead', false)).toBe('error')
  })

  test('maps the other wrapper states', () => {
    expect(agentMarkState('idle', false)).toBe('booting')
    expect(agentMarkState('idle', true)).toBe('idle')
    expect(agentMarkState('busy', true)).toBe('working')
    expect(agentMarkState('working', true)).toBe('working')
    expect(agentMarkState('error', true)).toBe('error')
    expect(agentMarkState('failed', true)).toBe('error')
    expect(agentMarkState('unknown', true)).toBe('booting')
    expect(agentMarkState('booting', true)).toBe('booting')
  })

  test('the typed waiting hook maps to attention once the pod is ready', () => {
    expect(agentMarkState('waiting', true)).toBe('attention')
    expect(agentMarkState('waiting', false)).toBe('booting')
  })
})

describe('markColour', () => {
  test('idle, working, attention and error are distinct tokens', () => {
    expect(markColour('idle')).toBe(TOKENS.textSecondary)
    expect(markColour('working')).toBe(TOKENS.info)
    expect(markColour('attention')).toBe(TOKENS.attention)
    expect(markColour('booting')).toBe(TOKENS.warning)
    expect(markColour('error')).toBe(TOKENS.error)
    expect(markColour('deleting')).toBe(TOKENS.textDisabled)
    expect(markColour('discarded')).toBe(TOKENS.textDisabled)
    const colours = (['idle', 'working', 'attention', 'booting', 'error'] as const).map(markColour)
    expect(new Set(colours).size).toBe(5)
  })

  test('labels', () => {
    expect(markLabel('idle')).toBe('idle')
    expect(markLabel('attention')).toBe('waiting for input')
  })
})
