import { describe, expect, test } from 'vitest'
import type { SessionSpec } from '../api/client'
import { stateFromPreset, toPresetSpec } from './sessionSpecForm'

describe('start_prompt', () => {
  test('a stored start prompt loads and round-trips', () => {
    const spec = { start_prompt: 'Hello {{ user }}' } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.startPrompt).toBe('Hello {{ user }}')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('unset stays out of the spec, and clearing a set prompt unsets it', () => {
    const unset = stateFromPreset(null, 'p', { replicas: 2 })
    expect(unset.values.startPrompt).toBe('')
    expect(toPresetSpec(unset.values, unset.setKeys)).not.toHaveProperty('start_prompt')
    const set = stateFromPreset(null, 'p', { start_prompt: 'x' })
    expect(toPresetSpec({ ...set.values, startPrompt: '' }, set.setKeys)).not.toHaveProperty('start_prompt')
  })
})
