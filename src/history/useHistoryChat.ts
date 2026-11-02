/** Read-only chat state of one stored session: the newest event records on open, older pages on demand, no stream. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyEvents, emptyChat, prependHistory } from '../chat/chatModel'
import type { ChatItem, ChatState, EventRow, SubagentInfo } from '../chat/chatModel'
import { listRecords } from './api'
import type { RecordView } from './api'

export const PAGE_SIZE = 200

export interface HistoryChat {
  items: ChatItem[]
  /** Subagent metadata (type, Task link, stopped) by claude agent id. */
  subagents: Readonly<Record<string, SubagentInfo>>
  loading: boolean
  loadingOlder: boolean
  hasMoreBefore: boolean
  error: string | null
  loadOlder: () => void
}

interface Loaded {
  chat: ChatState
  hasMoreBefore: boolean
  loading: boolean
  loadingOlder: boolean
  error: string | null
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** The stored export row of an `event` record is shaped like an orchestrator event row; anything else is skipped. */
const toRows = (records: readonly RecordView[]): EventRow[] =>
  records.flatMap((r) => {
    const b = r.body as Partial<EventRow> | null
    return b !== null && typeof b === 'object' && typeof b.id === 'number' && typeof b.type === 'string' ? [b as EventRow] : []
  })

/**
 * @param sessionId the history session (uuid).
 * @param ordinals agent id to ordinal, used to tag rows.
 */
export function useHistoryChat(sessionId: string, ordinals: Readonly<Record<string, number>>): HistoryChat {
  const ordinalsRef = useRef(ordinals)
  const fresh = (): Loaded => ({ chat: emptyChat(ordinals), hasMoreBefore: false, loading: true, loadingOlder: false, error: null })
  const [loaded, setLoaded] = useState<Loaded>(fresh)
  const epoch = useRef(0)
  /** Record id (the paging cursor, not the event id) of the oldest loaded record. */
  const oldestRecordId = useRef<number | null>(null)
  const moreBefore = useRef(false)
  const busyOlder = useRef(false)

  useEffect(() => {
    ordinalsRef.current = ordinals
  }, [ordinals])

  // The session id changing is the epoch boundary: everything from the previous session is dropped.
  const [shownSession, setShownSession] = useState(sessionId)
  if (shownSession !== sessionId) {
    setShownSession(sessionId)
    setLoaded(fresh())
  }

  useEffect(() => {
    const mine = ++epoch.current
    let active = true
    oldestRecordId.current = null
    moreBefore.current = false
    busyOlder.current = false
    listRecords(sessionId, { kind: 'event', limit: PAGE_SIZE })
      .then((page) => {
        if (!active || epoch.current !== mine) return
        oldestRecordId.current = page.records.length ? page.records[0].id : null
        moreBefore.current = page.has_more_before && page.records.length > 0
        setLoaded({ chat: applyEvents(emptyChat(ordinalsRef.current), toRows(page.records)), hasMoreBefore: moreBefore.current, loading: false, loadingOlder: false, error: null })
      })
      .catch((e: unknown) => {
        if (active && epoch.current === mine) setLoaded((s) => ({ ...s, loading: false, error: message(e) }))
      })
    return () => {
      active = false
    }
  }, [sessionId])

  const loadOlder = useCallback(() => {
    const mine = epoch.current
    const before = oldestRecordId.current
    if (busyOlder.current || !moreBefore.current || before === null) return
    busyOlder.current = true
    setLoaded((s) => ({ ...s, loadingOlder: true }))
    listRecords(sessionId, { kind: 'event', before_id: before, limit: PAGE_SIZE })
      .then((page) => {
        if (epoch.current !== mine) return
        if (page.records.length) oldestRecordId.current = page.records[0].id
        moreBefore.current = page.has_more_before && page.records.length > 0
        setLoaded((s) => ({ ...s, chat: prependHistory(s.chat, toRows(page.records)), hasMoreBefore: moreBefore.current, loadingOlder: false }))
      })
      .catch((e: unknown) => {
        if (epoch.current === mine) setLoaded((s) => ({ ...s, loadingOlder: false, error: message(e) }))
      })
      .finally(() => {
        if (epoch.current === mine) busyOlder.current = false
      })
  }, [sessionId])

  return useMemo(
    () => ({ items: loaded.chat.items, subagents: loaded.chat.subagents, loading: loaded.loading, loadingOlder: loaded.loadingOlder, hasMoreBefore: loaded.hasMoreBefore, error: loaded.error, loadOlder }),
    [loaded, loadOlder],
  )
}
