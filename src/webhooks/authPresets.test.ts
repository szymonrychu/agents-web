import { describe, expect, test } from 'vitest'
import { AUTH_PRESETS, authPayload, presetFor, presetById, setupHint, type AuthFields } from './authPresets'

const fields = (over: Partial<AuthFields> = {}): AuthFields => ({ mode: 'basic', header: '', prefix: '', timestampHeader: '', ...over })

describe('presets', () => {
  test('each sender preset pre-fills its mode and headers', () => {
    expect(presetById('gitlab')).toMatchObject({ mode: 'header', header: 'X-Gitlab-Token' })
    expect(presetById('github')).toMatchObject({ mode: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' })
    expect(presetById('grafana-bearer')).toMatchObject({ mode: 'bearer' })
    expect(presetById('grafana-hmac')).toMatchObject({ mode: 'hmac', header: 'X-Grafana-Alerting-Signature', prefix: '' })
    expect(presetById('basic')).toMatchObject({ mode: 'basic' })
    expect(AUTH_PRESETS.map((p) => p.id)).toEqual(['gitlab', 'github', 'grafana-bearer', 'grafana-hmac', 'basic', 'custom'])
  })

  test('presetFor recognises a stored config and falls back to custom', () => {
    expect(presetFor(fields({ mode: 'header', header: 'X-Gitlab-Token' })).id).toBe('gitlab')
    expect(presetFor(fields({ mode: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' })).id).toBe('github')
    expect(presetFor(fields({ mode: 'bearer' })).id).toBe('grafana-bearer')
    expect(presetFor(fields({ mode: 'header', header: 'X-Mine' })).id).toBe('custom')
  })
})

describe('authPayload', () => {
  test('sends only the fields that belong to the mode, the rest null', () => {
    expect(authPayload(fields({ mode: 'basic', header: 'X-Old' }))).toEqual({
      auth_mode: 'basic', auth_header: null, hmac_algorithm: null, hmac_prefix: null, hmac_timestamp_header: null,
    })
    expect(authPayload(fields({ mode: 'bearer' })).auth_header).toBeNull()
    expect(authPayload(fields({ mode: 'header', header: 'X-Gitlab-Token', prefix: 'x' }))).toEqual({
      auth_mode: 'header', auth_header: 'X-Gitlab-Token', hmac_algorithm: null, hmac_prefix: null, hmac_timestamp_header: null,
    })
    expect(authPayload(fields({ mode: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' }))).toEqual({
      auth_mode: 'hmac', auth_header: 'X-Hub-Signature-256', hmac_algorithm: 'sha256', hmac_prefix: 'sha256=', hmac_timestamp_header: null,
    })
    expect(authPayload(fields({ mode: 'hmac', header: 'H', timestampHeader: 'T' })).hmac_timestamp_header).toBe('T')
  })
})

describe('setupHint', () => {
  test('is specific per sender and generic otherwise', () => {
    expect(setupHint({ auth_mode: 'header', auth_header: 'X-Gitlab-Token', type: 'gitlab-mr' })).toMatch(/Secret token/)
    expect(setupHint({ auth_mode: 'hmac', auth_header: 'X-Hub-Signature-256', type: 'github-pr' })).toMatch(/Content type: application\/json/)
    expect(setupHint({ auth_mode: 'bearer', auth_header: null, type: 'grafana-alert' })).toMatch(/Bearer/)
    expect(setupHint({ auth_mode: 'header', auth_header: 'X-Mine', type: 'github-pr' })).toMatch(/X-Mine/)
    expect(setupHint({ auth_mode: 'basic', auth_header: null, type: 'grafana-alert' })).toMatch(/basic auth/i)
    expect(setupHint({ auth_mode: 'basic', auth_header: null, type: 'github-pr' })).toMatch(/<user>:<password>@<host>/)
  })
})
