/** The Claude credential end date and phase from /meta, as the one line the UI shows. */
import type { components } from '../api/schema'
import { getMeta } from '../api/client'
import { usePoll } from '../triggers'

export type MetaCredential = components['schemas']['MetaCredential']

export interface CredentialLine {
  severity: 'warning' | 'error'
  text: string
}

const POLL_MS = 300_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** `YYYY-MM-DD HH:MM UTC` of an ISO timestamp. */
export const utc = (iso: string): string => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`

const unit = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** Time to the end: whole days from one day on, else whole hours rounded up. */
export function timeLeft(expiresAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(expiresAt) - now)
  return ms >= DAY ? unit(Math.floor(ms / DAY), 'day') : unit(Math.max(1, Math.ceil(ms / HOUR)), 'hour')
}

export function credentialLine(c: MetaCredential | null | undefined, now: number): CredentialLine | null {
  if (!c || !c.expires_at) return null
  const at = utc(c.expires_at)
  if (c.phase === 'expired') return { severity: 'error', text: `Claude credential ended ${at}: messages are held until it is rotated` }
  if (c.phase === 'warn') return { severity: 'warning', text: `Claude credential ends ${at} (in ${timeLeft(c.expires_at, now)})` }
  if (c.phase === 'refuse') return { severity: 'warning', text: `Claude credential ends ${at} (in ${timeLeft(c.expires_at, now)}): new sessions are refused` }
  return null
}

export function useCredential(): MetaCredential | null {
  const { data } = usePoll(getMeta, POLL_MS, [])
  return data?.credential ?? null
}
