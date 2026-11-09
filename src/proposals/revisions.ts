/** Pure helpers over a proposal's revisions: card order and the "changed since" comparison. */
import type { ProposalItemView, ProposalRevisionView } from './api'

const rank = (i: ProposalItemView) => (i.grant ? 0 : i.security ? 1 : 2)

/** Grant items first, then other security items, then the rest; the server order is kept inside a group. */
export const orderItems = (items: ProposalItemView[]): ProposalItemView[] => [...items].sort((a, b) => rank(a) - rank(b))

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Paths whose proposed value differs from the previous revision's item at the same path. Items carry vault
 * references or plain values only, so the comparison is on `after` alone.
 */
export function changedPaths(current: ProposalRevisionView, previous: ProposalRevisionView | undefined): Set<string> {
  const out = new Set<string>()
  if (!previous) return out
  const before = new Map(previous.items.map((i) => [i.path, i]))
  for (const i of current.items) {
    const p = before.get(i.path)
    if (!p || !same(p.after, i.after)) out.add(i.path)
  }
  return out
}
