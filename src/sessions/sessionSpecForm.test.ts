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

describe('wrapper permission_mode', () => {
  test('a stored mode loads and round-trips', () => {
    const spec = { wrapper: { permission_mode: 'auto' } } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.permissionMode).toBe('auto')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('unset stays out of the spec', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { replicas: 2 })
    expect(values.permissionMode).toBe('')
    expect(toPresetSpec(values, setKeys)).not.toHaveProperty('wrapper')
  })
})

describe('usage_quota', () => {
  test('a stored quota loads, round-trips and stays sparse', () => {
    const spec = { usage_quota: { five_hour_pct: 50 } } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.quotaFiveHour).toBe('50')
    expect(values.quotaSevenDay).toBe('')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('null members count as unset', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { usage_quota: { five_hour_pct: null, seven_day_pct: 80 } } as Partial<SessionSpec>)
    expect(values.quotaFiveHour).toBe('')
    expect(toPresetSpec(values, setKeys)).toEqual({ usage_quota: { seven_day_pct: 80 } })
  })

  test('unset, or set then cleared, leaves usage_quota out', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { replicas: 2 })
    expect(toPresetSpec(values, setKeys)).not.toHaveProperty('usage_quota')
    const cleared = { ...values, quotaSevenDay: '' }
    expect(toPresetSpec(cleared, new Set([...setKeys, 'quotaSevenDay' as const]))).not.toHaveProperty('usage_quota')
  })

  test('values outside 1 to 100 are errors, empty is not', () => {
    const { values } = stateFromPreset(null, 'p', {})
    expect(validate(values, null)).not.toHaveProperty('quotaFiveHour')
    for (const bad of ['0', '101', '-1', '1.5', 'x']) {
      expect(validate({ ...values, quotaFiveHour: bad }, null).quotaFiveHour).toMatch(/1 to 100|whole number/)
      expect(validate({ ...values, quotaSevenDay: bad }, null).quotaSevenDay).toMatch(/1 to 100|whole number/)
    }
    for (const ok of ['1', '100']) expect(validate({ ...values, quotaFiveHour: ok }, null)).not.toHaveProperty('quotaFiveHour')
  })
})
