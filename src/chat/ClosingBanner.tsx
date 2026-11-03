/** "Closing when idle" banner for a pending self-close ("Closing for inactivity when idle, by HH:MMZ at the latest" for an inactivity close), with a Keep session button that cancels it; the status stream hides it afterwards. */
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { ApiError, cancelSessionClose, type SessionView } from '../api/client'
import { utcClock } from '../ribbon/sessionStatus'
import { formatAge, useNow } from './agentAge'

const TOO_LATE = 'Too late: the session is already being discarded'

export function ClosingBanner({ session }: { session: SessionView }) {
  const now = useNow()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ sessionId: string; text: string } | null>(null)
  if (session.desired !== 'active' || !session.close_requested_at) return null
  const keep = async () => {
    setBusy(true)
    setError(null)
    try {
      await cancelSessionClose(session.id)
    } catch (e) {
      const text = e instanceof ApiError && e.code === 'session_deleting' ? TOO_LATE : e instanceof Error ? e.message : String(e)
      setError({ sessionId: session.id, text })
    } finally {
      setBusy(false)
    }
  }
  const requestedAt = Date.parse(session.close_requested_at)
  const deadline = session.close_kind === 'inactivity' ? utcClock(session.close_deadline_at) : null
  const age = Number.isFinite(requestedAt) ? `, requested ${formatAge(now - requestedAt)} ago` : ''
  const reason = session.close_reason ? `: ${session.close_reason}` : ''
  const lead = session.close_kind === 'inactivity' ? (deadline === null ? `Closing for inactivity${age}` : `Closing for inactivity when idle, by ${deadline} at the latest`) : `Closing when idle${age}`
  const shownError = error && error.sessionId === session.id ? error.text : null
  return (
    <Alert
      severity="info"
      variant="outlined"
      sx={{ my: 1 }}
      action={
        <Button color="inherit" size="small" disabled={busy} onClick={keep}>
          Keep session
        </Button>
      }
    >
      {`${lead}${reason}`}
      {shownError ? (
        <Typography component="div" variant="caption" sx={{ color: 'error.main' }}>
          {shownError}
        </Typography>
      ) : null}
    </Alert>
  )
}
