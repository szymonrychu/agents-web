import { describe, expect, test } from 'vitest'
import type { Meta, SessionSpec } from '../api/client'
import { envRow, humanizeSeconds, kubeNamespaceAccessErrors, mergeEnvRows, stateFromPreset, toPresetSpec, validate, vaultRow } from './sessionSpecForm'

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

describe('volume attachments', () => {
  const attachments = [
    { volume: 'v-1', mode: 'rw', backup_restore: true, mount_path: '/data' },
    { volume: 'v-2', mode: 'ro', backup_restore: false },
  ] as NonNullable<SessionSpec['volumes']>

  test('attachments round trip spec -> form -> spec, the default path stays unset', () => {
    const spec = { volumes: attachments } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.volumes[0]).toMatchObject({ volume: 'v-1', mountPath: '/data', mode: 'rw', backupRestore: true })
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('no attachments means no volumes key, and removing all clears the stored ones on an edit', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { replicas: 2 })
    expect(toPresetSpec(values, setKeys)).not.toHaveProperty('volumes')
    const spec = { volumes: attachments, model: 'opus' } as Partial<SessionSpec>
    const loaded = stateFromPreset(null, 'p', spec)
    expect(toPresetSpec({ ...loaded.values, volumes: [] }, loaded.setKeys, spec)).toEqual({ model: 'opus' })
  })

  test('validate refuses relative, .., / and // paths, a missing volume and duplicate paths', () => {
    const { values } = stateFromPreset(null, 'p', { volumes: attachments })
    const row = values.volumes[0]
    const bad = [{ ...row, mountPath: 'rel' }, { ...row, mountPath: '/a/../b' }, { ...row, mountPath: '/' }, { ...row, mountPath: '//x' }, { ...row, volume: '' }, { ...row, mountPath: '/ok' }, { ...row, mountPath: '/ok' }]
    const errors = validate({ ...values, volumes: bad }, null).volumes
    expect(errors?.map((e) => e !== undefined)).toEqual([true, true, true, true, true, true, true])
    expect(validate({ ...values, volumes: [{ ...row, mountPath: '/claude' }] }, null).volumes).toBeUndefined()
  })
})

describe('retrospective and handoff_profile', () => {
  test('a stored flag and profile load and round-trip', () => {
    const spec = { retrospective: true, handoff_profile: 'chat' } as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    expect(values.retrospective).toBe(true)
    expect(values.handoffProfile).toBe('chat')
    expect(toPresetSpec(values, setKeys)).toEqual(spec)
  })

  test('off stays out of the spec and clears a stored flag on an edit', () => {
    const { values, setKeys } = stateFromPreset(null, 'p', { retrospective: true })
    expect(toPresetSpec({ ...values, retrospective: false }, setKeys)).toEqual({})
    expect(toPresetSpec({ ...values, retrospective: false }, setKeys, { retrospective: true, model: 'x' })).toEqual({ model: 'x' })
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

describe('env rows', () => {
  test('test_ref_round_trips_exactly', () => {
    const spec = { env: { A: { value: 'x', expand: true }, G: { vault: 'u-1', env: 'GITHUB_TOKEN' } } } as unknown as Partial<SessionSpec>
    const { values, setKeys } = stateFromPreset(null, 'p', spec)
    const out = toPresetSpec(values, setKeys)
    expect(out).toEqual(spec)
    expect(JSON.stringify(out)).not.toContain('protected')
  })

  test('test_merge_env_rows', () => {
    const r2 = { vault: 'u-2', env: 'T' }
    const current = [envRow('A', 'x'), vaultRow('G', { vault: 'u-1', env: 'T' })]
    expect(mergeEnvRows(current, [vaultRow('A', r2), vaultRow('B', r2)])).toEqual([vaultRow('A', r2), current[1], vaultRow('B', r2)])
  })

  test('mergeEnvRows drops rows with no key, no value and no ref', () => {
    expect(mergeEnvRows([envRow()], [envRow('K', 'v')])).toEqual([envRow('K', 'v')])
  })

  test('test_refs_cap', () => {
    const st = stateFromPreset(null, 'p', {})
    const rows = (n: number) => Array.from({ length: n }, (_, i) => vaultRow(`K${i}`, { vault: 'u-1', env: 'T' }))
    expect(validate({ ...st.values, name: 'ok', env: rows(51) }, null).envSection).toBe('At most 50 vault references')
    expect(validate({ ...st.values, name: 'ok', env: rows(50) }, null).envSection).toBeUndefined()
  })
})
