/** Chat state of one session: newest page on open, older pages on demand, live follow, epoch guard on switch. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { eventStreamUrl, listEvents } from '../api/client'
import { openStream } from '../api/stream'
import { applyEvents, emptyChat, prependHistory, trimWindow, MAX_ITEMS } from './chatModel'
import type { ChatItem, ChatState, EventRow, SubagentInfo } from './chatModel'

export const PAGE_SIZE = 200

/** Stream frames are named after the event type (EventSource has no wildcard). */
const STREAM_EVENTS = [
  'user_message',
  'peer_message_received',
  'assistant_text',
  'thinking',
  'tool_call',
  'tool_result',
  'tool_denied',
  'turn_completed',
  'turn_failed',
  'error',
  'gap',
  'subagent_started',
  'subagent_stopped',
]

export interface SessionChat {
  items: ChatItem[]
  /** Subagent metadata (type, Task link, running/stopped) by claude agent id. */
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

/**
 * @param ordinals agent id to ordinal, used to tag rows.
 * @param maxItems live window size; injectable so tests can use a small window.
 */
export function useSessionChat(sessionId: string, ordinals: Readonly<Record<string, number>>, maxItems: number = MAX_ITEMS): SessionChat {
  const fresh = (): Loaded => ({ chat: emptyChat(ordinals), hasMoreBefore: false, loading: true, loadingOlder: false, error: null })
  const [loaded, setLoaded] = useState<Loaded>(fresh)
  const epoch = useRef(0)
  const ordinalsRef = useRef(ordinals)
  const maxItemsRef = useRef(maxItems)
  const oldestId = useRef<number | null>(null)
  const busyOlder = useRef(false)
  const moreBefore = useRef(false)

  // Keep the paging cursor in step with the window: a live trim moves the oldest loaded id forward.
  useEffect(() => {
    if (loaded.loading || loaded.chat.items.length === 0) return
    oldestId.current = loaded.chat.items[0].eventId
    moreBefore.current = loaded.hasMoreBefore
  }, [loaded])

  useEffect(() => {
    ordinalsRef.current = ordinals
  }, [ordinals])

  useEffect(() => {
    maxItemsRef.current = maxItems
  }, [maxItems])

  // The session id changing is the epoch boundary: everything from the previous session is dropped.
  const [shownSession, setShownSession] = useState(sessionId)
  if (shownSession !== sessionId) {
    setShownSession(sessionId)
    setLoaded(fresh())
  }

  useEffect(() => {
    const mine = ++epoch.current
    let active = true
    const current = () => active && epoch.current === mine
    oldestId.current = null
    busyOlder.current = false
    moreBefore.current = false
    let stream: { close: () => void } | null = null
    listEvents(sessionId, { limit: PAGE_SIZE })
      .then((page) => {
        if (!current()) return
        const rows = page.events as unknown as EventRow[]
        oldestId.current = rows.length ? rows[0].id : null
        moreBefore.current = page.has_more_before
        setLoaded({ chat: applyEvents(emptyChat(ordinalsRef.current), rows), hasMoreBefore: page.has_more_before, loading: false, loadingOlder: false, error: null })
        stream = openStream(eventStreamUrl(sessionId), {
          eventNames: STREAM_EVENTS,
          afterId: page.next_after_id ?? (rows.length ? rows[rows.length - 1].id : 0),
          onEvent: (data) => {
            if (!current() || data === null || typeof data !== 'object') return
            const row = data as EventRow
            setLoaded((s) => {
              const applied = applyEvents(s.chat, [row])
              const chat = trimWindow(applied, maxItemsRef.current)
              // Trimmed front items are older history again: page from the new oldest id.
              return chat === applied ? { ...s, chat } : { ...s, chat, hasMoreBefore: true }
            })
          },
        })
      })
      .catch((e: unknown) => {
        if (current()) setLoaded((s) => ({ ...s, loading: false, error: message(e) }))
      })
    return () => {
      active = false
      stream?.close()
    }
  }, [sessionId])

  const loadOlder = useCallback(() => {
    const mine = epoch.current
    const before = oldestId.current
    if (busyOlder.current || !moreBefore.current || before === null) return
    busyOlder.current = true
    setLoaded((s) => ({ ...s, loadingOlder: true }))
    listEvents(sessionId, { limit: PAGE_SIZE, before_id: before })
      .then((page) => {
        if (epoch.current !== mine) return
        const rows = page.events as unknown as EventRow[]
        if (rows.length) oldestId.current = Math.min(before, rows[0].id)
        moreBefore.current = page.has_more_before && rows.length > 0
        setLoaded((s) => ({ ...s, chat: prependHistory(s.chat, rows), hasMoreBefore: moreBefore.current, loadingOlder: false }))
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
