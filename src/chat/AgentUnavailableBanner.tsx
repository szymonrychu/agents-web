/** "Agent unavailable" alert: messages are queued and no agent can take them, or the oldest has waited too long. */
import Alert from '@mui/material/Alert'
import type { AgentView, SessionView } from '../api/client'
import { formatAge, useNow } from './agentAge'

/** A queue behind a busy agent is normal; past this age it surfaces as stuck. */
export const STALE_QUEUE_MS = 10 * 60 * 1000

export interface AgentUnavailableBannerProps {
  session: SessionView
  agents: AgentView[]
}

export function AgentUnavailableBanner({ session, agents }: AgentUnavailableBannerProps) {
  const now = useNow()
  const { queued, oldest_queued_at: oldestQueuedAt } = session.summary
  if (queued <= 0) return null
  const queuedAt = oldestQueuedAt === null ? NaN : Date.parse(oldestQueuedAt)
  const ageMs = Number.isFinite(queuedAt) ? now - queuedAt : null
  const alive = agents.some((a) => a.ready && a.state !== 'dead')
  if (alive && (ageMs === null || ageMs <= STALE_QUEUE_MS)) return null
  const count = `${queued} ${queued === 1 ? 'message' : 'messages'} queued`
  return (
    <Alert severity="warning" variant="outlined" sx={{ my: 1 }}>
      {`Agent unavailable: ${count}${ageMs === null ? '' : `, oldest ${formatAge(ageMs)} ago`}`}
    </Alert>
  )
}
