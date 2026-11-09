import { useEffect, useMemo, useState } from 'react'
import { listEntries, vaultEnabled, type EntryView } from './api'

export type VaultEntriesStatus = 'off' | 'loading' | 'ready' | 'error'

type Loaded = { entries: EntryView[] } | { error: string }

/** One `GET /vault/v1/entries` per mount; `off` (no request) when the vault backend is not configured. */
export function useVaultEntries(): {
  status: VaultEntriesStatus
  entries: EntryView[]
  byId: ReadonlyMap<string, EntryView>
  error: string | null
} {
  const enabled = vaultEnabled()
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    listEntries().then(
      (entries) => { if (!cancelled) setLoaded({ entries }) },
      (e: unknown) => { if (!cancelled) setLoaded({ error: e instanceof Error ? e.message : String(e) }) },
    )
    return () => { cancelled = true }
  }, [enabled])

  const entries = useMemo(() => (loaded && 'entries' in loaded ? loaded.entries : []), [loaded])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const error = loaded && 'error' in loaded ? loaded.error : null
  const status: VaultEntriesStatus = !enabled ? 'off' : !loaded ? 'loading' : error !== null ? 'error' : 'ready'
  return { status, entries, byId, error }
}
