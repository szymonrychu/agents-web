import { describe, expect, test } from 'vitest'
import type { SessionSpec } from '../api/client'
import { stateFromPreset, toPresetSpec, validate } from './sessionSpecForm'

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

describe('cache restore_key and save_key', () => {
  test('stored keys load and round-trip, an empty save_key stays explicit', () => {
    const spec = { cache: { restore_key: 'team/{{ preset_name }}/', save_key: '', exclude: ['a'] } } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.cacheDerive).toBe(false)
    expect(values.cacheRestoreKey).toBe('team/{{ preset_name }}/')
    expect(values.cacheSaveKey).toBe('')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('a cache without keys derives them from the preset and sends neither key', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { cache: { exclude: [] } })
    expect(values.cacheDerive).toBe(true)
    expect(toPresetSpec(values, setKeys)).toEqual({ cache: {} })
  })

  test('explicit keys never send the old key', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { cache: { exclude: [] } })
    const spec = toPresetSpec({ ...values, cacheDerive: false, cacheRestoreKey: 'a', cacheSaveKey: 'b-{{ now }}' }, setKeys)
    expect(spec.cache).toEqual({ restore_key: 'a', save_key: 'b-{{ now }}' })
    expect(spec.cache).not.toHaveProperty('key')
  })

  test('validate caps each key at 256 characters', () => {
    const { values } = stateFromPreset(null, 'p', { cache: { exclude: [] } })
    const errors = validate({ ...values, cacheDerive: false, cacheRestoreKey: 'x'.repeat(257), cacheSaveKey: 'ok' }, null)
    expect(errors.cacheRestoreKey).toBe('Restore key: at most 256 characters')
    expect(errors.cacheSaveKey).toBeUndefined()
  })
})
