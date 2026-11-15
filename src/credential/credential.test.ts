import { describe, expect, test } from 'vitest'
import { credentialLine } from './credential'
import type { MetaCredential } from './credential'

const E = '2027-10-23T00:00:00Z'
const T = Date.parse(E)
const cred = (phase: MetaCredential['phase'], over: Partial<MetaCredential> = {}): MetaCredential => ({ expires_at: E, phase, warn_days: 10, refuse_hours: 24, ...over })

describe('credentialLine', () => {
  test('warn counts whole days', () => {
    expect(credentialLine(cred('warn'), T - 9 * 86400000)).toEqual({ severity: 'warning', text: 'Claude credential ends 2027-10-23 00:00 UTC (in 9 days)' })
  })
  test('one day is singular', () => {
    expect(credentialLine(cred('warn'), T - 86400000)?.text.endsWith('(in 1 day)')).toBe(true)
  })
  test('refuse counts hours and says new sessions are refused', () => {
    expect(credentialLine(cred('refuse'), T - 12 * 3600000)?.text).toBe('Claude credential ends 2027-10-23 00:00 UTC (in 12 hours): new sessions are refused')
  })
  test('expired is an error', () => {
    expect(credentialLine(cred('expired'), T + 1000)).toEqual({ severity: 'error', text: 'Claude credential ended 2027-10-23 00:00 UTC: messages are held until it is rotated' })
  })
  test('ok, unknown and null give nothing', () => {
    expect(credentialLine(cred('ok'), T - 86400000 * 30)).toBeNull()
    expect(credentialLine(cred('unknown', { expires_at: null }), T)).toBeNull()
    expect(credentialLine(null, T)).toBeNull()
  })
})
