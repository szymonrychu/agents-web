import { describe, expect, test } from 'vitest'
import { ApiError } from '../api/client'
import { vaultRowErrors, VAULT_ROW_MESSAGES } from './vaultErrors'

const err = (status: number, code: string, details: Record<string, unknown> = {}) => new ApiError(status, code, 'm', details)

describe('vaultRowErrors', () => {
  test.each([
    ['vault_entry_unknown', 'Vault entry not found; pick another entry'],
    ['vault_env_unknown', 'The vault entry has no such env'],
    ['vault_label_mismatch', "The entry's project label does not allow this preset's project"],
    ['vault_ref_not_allowed', 'Vault references are not allowed here'],
  ])('%s marks the named env', (code, message) => {
    expect(VAULT_ROW_MESSAGES[code]).toBe(message)
    expect(vaultRowErrors(err(422, code, { envs: ['G'] }), ['G', 'H'])).toEqual({ G: message })
  })

  test('vault_entry_unknown ignores details.entries', () => {
    expect(vaultRowErrors(err(422, 'vault_entry_unknown', { envs: ['G'], entries: ['H'] }), ['G', 'H'])).toEqual({ G: 'Vault entry not found; pick another entry' })
  })

  test('503 vault_unavailable marks every ref row', () => {
    const m = 'The vault is unavailable; nothing was saved, try again'
    expect(vaultRowErrors(err(503, 'vault_unavailable'), ['G', 'H'])).toEqual({ G: m, H: m })
  })

  test('other errors give nothing', () => {
    expect(vaultRowErrors(err(409, 'conflict', { envs: ['G'] }), ['G'])).toEqual({})
    expect(vaultRowErrors(new Error('x'), ['G'])).toEqual({})
  })
})
