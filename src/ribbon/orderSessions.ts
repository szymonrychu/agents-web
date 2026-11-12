/** Derived tab order: pins sit over the alphabetical base order and are never stored. */
import type { SessionEntry } from './useSessions'

export interface OrderPins {
  lastTalkedId: string | null
  attentionIds: ReadonlySet<string>
}

/** Last-talked session first, then attention sessions, then the rest; each in input order, each once. */
export function orderSessions(entries: readonly SessionEntry[], pins: OrderPins): SessionEntry[] {
  const first = entries.filter((e) => e.session.id === pins.lastTalkedId)
  const attention = entries.filter((e) => e.session.id !== pins.lastTalkedId && pins.attentionIds.has(e.session.id))
  const rest = entries.filter((e) => e.session.id !== pins.lastTalkedId && !pins.attentionIds.has(e.session.id))
  return [...first, ...attention, ...rest]
}

/** The live superleader the user messaged most recently, by the server-recorded last_user_message_at. */
export function lastTalkedSuperleader(entries: readonly SessionEntry[]): string | null {
  let best: { id: string; slug: string; at: number } | null = null
  for (const { session, discarded } of entries) {
    if (discarded || session.desired === 'deleting' || session.spec.session_messaging !== true || !session.last_user_message_at) continue
    const at = Date.parse(session.last_user_message_at)
    if (Number.isNaN(at)) continue
    if (best === null || at > best.at || (at === best.at && session.slug.localeCompare(best.slug) < 0)) best = { id: session.id, slug: session.slug, at }
  }
  return best?.id ?? null
}
