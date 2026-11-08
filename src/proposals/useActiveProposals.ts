import { useEffect, useRef } from 'react'
import { usePoll } from '../triggers'
import { loadJson, saveJson } from '../layout/storage'
import { listProposals, type ProposalView } from './api'

export const POLL_MS = 20000
const SEEN_KEY = 'proposals.seen'
const SEEN_MAX = 200

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const keyOf = (p: ProposalView) => `${p.id}:${p.revision}`

export interface ActiveProposals {
  proposals: ProposalView[]
  /** Proposals waiting on a human decision: status open or stale. */
  count: number
}

/**
 * Polls the active proposals (20 s, visible tab only). `onAutoOpen` runs once for each (id, revision)
 * seen in `open` for the first time; seen keys persist in localStorage, and when storage fails the
 * in-memory set still limits it to once per page load.
 */
export function useActiveProposals(onAutoOpen?: (proposal: ProposalView) => void): ActiveProposals {
  const { data } = usePoll(() => listProposals('active'), POLL_MS, [])
  const proposals = data ?? []
  const seen = useRef<Set<string> | null>(null)
  const open = useRef(onAutoOpen)
  useEffect(() => {
    open.current = onAutoOpen
  })
  useEffect(() => {
    if (!data) return
    seen.current ??= new Set(loadJson(SEEN_KEY, [], isStrings))
    const fresh = data.filter((p) => p.status === 'open' && !seen.current!.has(keyOf(p)))
    if (fresh.length === 0) return
    for (const p of fresh) seen.current.add(keyOf(p))
    saveJson(SEEN_KEY, [...seen.current].slice(-SEEN_MAX))
    for (const p of fresh) open.current?.(p)
  }, [data])
  return { proposals, count: proposals.filter((p) => p.status === 'open' || p.status === 'stale').length }
}
