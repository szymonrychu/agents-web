import { describe, expect, test } from 'vitest'
import type { Meta, SessionSpec } from '../api/client'
import { humanizeSeconds, kubeNamespaceAccessErrors, stateFromPreset, toPresetSpec, validate } from './sessionSpecForm'

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

describe('docker sidecar', () => {
  test('a stored docker spec loads and round-trips with its sizes', () => {
    const spec = { docker: true, docker_storage: '50Gi', docker_cpu: '2', docker_memory: '4Gi' } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.docker).toBe(true)
    expect(values.dockerStorage).toBe('50Gi')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('docker alone sends no sizes, and off sends nothing', () => {
    const on = stateFromPreset(null, 'p', { docker: true } as Partial<SessionSpec>)
    expect(toPresetSpec(on.values, on.setKeys)).toEqual({ docker: true })
    const off = toPresetSpec({ ...on.values, docker: false, dockerStorage: '9Gi' }, on.setKeys)
    expect(off).not.toHaveProperty('docker')
    expect(off).not.toHaveProperty('docker_storage')
  })

  test('unset docker stays out of the spec', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { replicas: 2 })
    expect(values.docker).toBe(false)
    expect(toPresetSpec(values, setKeys)).not.toHaveProperty('docker')
  })
})

describe('inactivity limits', () => {
  const metaWith = (reminder: number, close: number) => ({ defaults: { replicas: 1 }, caps: { max_replicas: 16 }, hook_events: [], inactivity: { reminder_seconds: reminder, close_seconds: close, handoff_seconds: 300 } }) as unknown as Meta

  test('maps stored inactivity to the form and back', () => {
    const spec = { inactivity: { reminder_seconds: 600 } } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.inactivityReminder).toBe('600')
    expect(values.inactivityClose).toBe('')
    const out = toPresetSpec(values, setKeys)
    expect(out).toEqual({ inactivity: { reminder_seconds: 600 } })
    expect(out.inactivity).not.toHaveProperty('close_seconds')
  })

  test('round-trips inactivity unchanged', () => {
    const spec = { inactivity: { reminder_seconds: 0, close_seconds: 14400 } } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.inactivityReminder).toBe('0')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('empty inactivity is not sent', () => {
    const unset = stateFromPreset(null, 'p', { replicas: 2 })
    expect(toPresetSpec(unset.values, unset.setKeys)).not.toHaveProperty('inactivity')
    const set = stateFromPreset(null, 'p', { inactivity: { reminder_seconds: 600 } } as Partial<SessionSpec>)
    expect(toPresetSpec({ ...set.values, inactivityReminder: '' }, set.setKeys)).not.toHaveProperty('inactivity')
  })

  test('validates inactivity values', () => {
    const { values } = stateFromPreset(null, 'p', {})
    expect(validate({ ...values, inactivityReminder: '30' }, null).inactivityReminder).toBe('Reminder after quiet seconds: 0 or 60 to 2592000')
    expect(validate({ ...values, inactivityReminder: '0' }, null).inactivityReminder).toBeUndefined()
    expect(validate({ ...values, inactivityReminder: '60' }, null).inactivityReminder).toBeUndefined()
    expect(validate({ ...values, inactivityReminder: '2592001' }, null).inactivityReminder).toBe('Reminder after quiet seconds: 0 or 60 to 2592000')
    expect(validate({ ...values, inactivityReminder: 'x' }, null).inactivityReminder).toBe('Reminder after quiet seconds: 0 or 60 to 2592000')
    expect(validate({ ...values, inactivityClose: '30' }, null).inactivityClose).toBe('Close after quiet seconds: 0 or 60 to 2592000')
    expect(validate({ ...values, inactivityClose: '' }, null).inactivityClose).toBeUndefined()
  })

  test('reminder must be below close', () => {
    const { values } = stateFromPreset(null, 'p', {})
    const meta = metaWith(3600, 14400)
    expect(validate({ ...values, inactivityReminder: '14400' }, meta).inactivityReminder).toBe('Reminder after quiet seconds must be below close after quiet seconds')
    expect(validate({ ...values, inactivityReminder: '0', inactivityClose: '600' }, meta).inactivityReminder).toBeUndefined()
    expect(validate({ ...values, inactivityReminder: '0', inactivityClose: '600' }, meta).inactivityClose).toBeUndefined()
    expect(validate({ ...values, inactivityReminder: '600', inactivityClose: '600' }, meta).inactivityReminder).toBeDefined()
    expect(validate({ ...values, inactivityReminder: '600', inactivityClose: '0' }, meta).inactivityReminder).toBeUndefined()
    expect(validate({ ...values, inactivityClose: '600' }, meta).inactivityClose).toBe('Close after quiet seconds must be above reminder after quiet seconds')
    expect(validate({ ...values, inactivityReminder: '600', inactivityClose: '900' }, meta).inactivityReminder).toBeUndefined()
  })

  test('humanizeSeconds matches the orchestrator rule', () => {
    expect([30, 59, 60, 600, 3300, 3599, 3600, 5400, 14400, 5460].map(humanizeSeconds)).toEqual(['30 s', '59 s', '1 min', '10 min', '55 min', '59 min', '1 h', '1.5 h', '4 h', '1.5 h'])
  })
})

describe('kube_namespace_access', () => {
  test('round-trips', () => {
    const spec = { kube_namespace_access: { media: ['read', 'port-forward'] } } as Partial<SessionSpec>
    const st = stateFromPreset(null, 'p', spec)
    expect(st.values.kubeNamespaceAccess).toEqual([{ namespace: 'media', tiers: ['read', 'port-forward'] }])
    expect(toPresetSpec(st.values, st.setKeys)).toEqual(spec)
  })

  test('omits an empty map', () => {
    const st = stateFromPreset(null, 'p', { kube_namespace_access: { media: ['read'] } } as Partial<SessionSpec>)
    expect(toPresetSpec({ ...st.values, kubeNamespaceAccess: [] }, st.setKeys)).not.toHaveProperty('kube_namespace_access')
    const unset = stateFromPreset(null, 'p', { replicas: 2 })
    expect(unset.values.kubeNamespaceAccess).toEqual([])
    expect(toPresetSpec(unset.values, unset.setKeys)).not.toHaveProperty('kube_namespace_access')
  })

  test('writes tiers in canonical order and namespaces sorted', () => {
    const st = stateFromPreset(null, 'p', { kube_namespace_access: { media: ['read'] } } as Partial<SessionSpec>)
    const values = { ...st.values, kubeNamespaceAccess: [{ namespace: 'zeta', tiers: ['admin', 'read'] }, { namespace: 'alpha', tiers: ['exec', 'port-forward', 'edit'] }] }
    const spec = toPresetSpec(values, st.setKeys)
    expect(spec.kube_namespace_access).toEqual({ alpha: ['port-forward', 'exec', 'edit'], zeta: ['read', 'admin'] })
    expect(Object.keys(spec.kube_namespace_access ?? {})).toEqual(['alpha', 'zeta'])
  })

  test('flags a row without tiers or without a namespace', () => {
    expect(kubeNamespaceAccessErrors([{ namespace: 'media', tiers: [] }])).toEqual(['Pick at least one tier'])
    expect(kubeNamespaceAccessErrors([{ namespace: '', tiers: ['read'] }])).toEqual(['Pick a namespace'])
    expect(kubeNamespaceAccessErrors([{ namespace: 'media', tiers: ['read'] }])).toBeUndefined()
    expect(kubeNamespaceAccessErrors([])).toBeUndefined()
  })

  test('validate carries the row errors', () => {
    const st = stateFromPreset(null, 'p', {})
    const e = validate({ ...st.values, name: 'ok', kubeNamespaceAccess: [{ namespace: 'media', tiers: [] }] }, null)
    expect(e.kubeNamespaceAccess).toEqual(['Pick at least one tier'])
  })
})
