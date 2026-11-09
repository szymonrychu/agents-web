import { ApiError } from '../api/client'

/** Row messages for the S2 vault errors on a preset save, keyed by error code. */
export const VAULT_ROW_MESSAGES: Record<string, string> = {
  vault_entry_unknown: 'Vault entry not found; pick another entry',
  vault_env_unknown: 'The vault entry has no such env',
  vault_label_mismatch: "The entry's project label does not allow this preset's project",
  vault_ref_not_allowed: 'Vault references are not allowed here',
  vault_unavailable: 'The vault is unavailable; nothing was saved, try again',
}

/**
 * Per-row messages for a failed save: the keys in `details.envs` of a vault error get its message, and
 * `vault_unavailable` (it names no envs) marks every ref row. Anything else gives no row errors.
 */
export function vaultRowErrors(e: unknown, refKeys: string[]): Record<string, string> {
  if (!(e instanceof ApiError)) return {}
  const message = VAULT_ROW_MESSAGES[e.code]
  if (message === undefined) return {}
  const named = e.details.envs
  const keys = e.code === 'vault_unavailable' ? refKeys : Array.isArray(named) ? named.filter((k): k is string => typeof k === 'string') : []
  return Object.fromEntries(keys.map((k) => [k, message]))
}
