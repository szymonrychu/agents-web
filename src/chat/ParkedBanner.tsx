/** "Parked by the runaway guard" banner with a Resume button that releases the session's queue; the status stream hides it afterwards. */
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { ApiError, resumeSession, type SessionView } from '../api/client'
import { parkedText } from '../ribbon/sessionStatus'

const TOO_LATE = 'Too late: the session is already being discarded'

export function ParkedBanner({ session }: { session: SessionView }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ sessionId: string; text: string } | null>(null)
  const reason = session.desired === 'active' ? parkedText(session) : null
  if (reason === null) return null
  const resume = async () => {
    setBusy(true)
    setError(null)
    try {
      await resumeSession(session.id)
    } catch (e) {
      const text = e instanceof ApiError && e.code === 'session_deleting' ? TOO_LATE : e instanceof Error ? e.message : String(e)
      setError({ sessionId: session.id, text })
    } finally {
      setBusy(false)
    }
  }
  const shownError = error && error.sessionId === session.id ? error.text : null
  return (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ my: 1 }}
      action={
        <Button color="inherit" size="small" disabled={busy} onClick={resume}>
          Resume
        </Button>
      }
    >
      {`Parked by the runaway guard: ${reason}`}
      {shownError ? (
        <Typography component="div" variant="caption" sx={{ color: 'error.main' }}>
          {shownError}
        </Typography>
      ) : null}
    </Alert>
  )
}
