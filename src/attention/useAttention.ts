/** Which listed sessions need the user, from taskboard waiting tasks (when configured) and agent prompt state. */
import { useMemo } from 'react'
import { isConfigured } from '../config/backends'
import type { SessionEntry } from '../ribbon/useSessions'
import { listTasks } from '../tasks/api'
import type { TaskPage } from '../tasks/api'
import { useTaskStream } from '../tasks/useTaskStream'
import { usePoll } from '../triggers/usePoll'
import { attentionOf, groupOpenDecisions } from './attention'
import type { SessionAttention } from './attention'

export interface Attention {
  bySession: Map<string, SessionAttention>
  /** Same identity while the set of ids is unchanged, so the derived tab order does not churn. */
  ids: ReadonlySet<string>
  refresh: () => Promise<void>
}

const EMPTY_PAGE: TaskPage = { items: [], next_cursor: null }

export function useAttention(entries: readonly SessionEntry[]): Attention {
  const enabled = isConfigured('taskboard')
  // Without the taskboard backend nothing is fetched and no stream is opened; prompts still count.
  const poll = usePoll(() => (enabled ? listTasks({ status: 'active', waiting: true, limit: 200 }) : Promise.resolve(EMPTY_PAGE)), 10000, [enabled])
  const { refresh } = poll
  useTaskStream(() => void refresh())
  // usePoll keeps the last good page on a failed call, so a taskboard hiccup never unpins a session.
  const items = poll.data?.items
  const grouped = useMemo(() => groupOpenDecisions(items ?? []), [items])
  const bySession = useMemo(() => attentionOf(entries, grouped), [entries, grouped])
  const key = [...bySession.keys()].sort().join('\n')
  const ids = useMemo<ReadonlySet<string>>(() => new Set(key === '' ? [] : key.split('\n')), [key])
  return { bySession, ids, refresh }
}
