/** Header (slug, state, agents strip) and the log of one session. */
import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { AgentView, SessionView } from '../api/client'
import { AgentsStrip } from './AgentsStrip'
import { ChatLog } from './ChatLog'
import { Composer } from './Composer'
import { QueueStrip } from './QueueStrip'
import { ScaleControl } from './ScaleControl'
import { filterByAgents } from './chatModel'
import { useSessionChat } from './useSessionChat'
import { TOKENS } from '../theme'

/** status is a free-form dict: read status.drain.waiting defensively (absent when no drain). */
function drainWaiting(session: SessionView): number[] {
  const drain = (session.status as Record<string, unknown> | null | undefined)?.drain as { waiting?: unknown } | null | undefined
  return Array.isArray(drain?.waiting) ? drain.waiting.filter((n): n is number => typeof n === 'number') : []
}

export interface ChatViewProps {
  session: SessionView
  agents: AgentView[]
  /** Live window size; defaults to the production MAX_ITEMS. */
  maxItems?: number
}

export function ChatView({ session, agents, maxItems }: ChatViewProps) {
  const [filter, setFilter] = useState<{ sessionId: string; ids: string[] }>({ sessionId: session.id, ids: [] })
  const selected = useMemo(() => (filter.sessionId === session.id ? filter.ids : []), [filter, session.id])
  const ordinals = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.ordinal])), [agents])
  const chat = useSessionChat(session.id, ordinals, maxItems)
  const items = useMemo(() => filterByAgents(chat.items, selected), [chat.items, selected])
  const toggle = (id: string) => setFilter({ sessionId: session.id, ids: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] })
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, pb: 1, borderBottom: `${TOKENS.borderWidth}px solid ${TOKENS.border}` }}>
        <Typography variant="h5" component="h2">
          {session.slug}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {session.desired === 'deleting' ? 'deleting' : session.summary.state}
        </Typography>
        <ScaleControl session={session} />
        <AgentsStrip
          agents={agents}
          replicas={session.spec.replicas}
          drainWaiting={drainWaiting(session)}
          selected={selected}
          onToggle={toggle}
          autoCompactPct={session.summary.auto_compact_pct}
          hive={session.hive ? { sessionId: session.id, leaderEpoch: session.leader_epoch, leaderReason: session.leader_reason } : undefined}
        />
      </Box>
      {chat.error ? <Alert severity="error">{chat.error}</Alert> : null}
      {chat.loading ? (
        <Typography sx={{ color: 'text.secondary', pt: 1 }}>Loading messages</Typography>
      ) : (
        <ChatLog key={`${session.id}:${selected.join(',')}`} items={items} hasMoreBefore={chat.hasMoreBefore} loadingOlder={chat.loadingOlder} onLoadOlder={chat.loadOlder} />
      )}
      <QueueStrip sessionId={session.id} />
      <Composer key={session.id} sessionId={session.id} agents={agents} deleting={session.desired === 'deleting'} />
    </Box>
  )
}
