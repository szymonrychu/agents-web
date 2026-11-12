/** Restart confirmation: every agent pod of the session is deleted and recreated. */
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import { ApiError, restartSession } from '../api/client'
import type { SessionView } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'

/** Mount it per restart (state starts fresh). */
export interface RestartSessionDialogProps {
  open: boolean
  session: SessionView
  onClose: () => void
}

export function RestartSessionDialog({ open, session, onClose }: RestartSessionDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restart() {
    setBusy(true)
    setError(null)
    try {
      await restartSession(session.id)
      onClose()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'session_deleting') setError('This session is being discarded')
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Restart ${session.slug}?`}
      body="Every agent pod of this session is deleted and recreated. Running turns stop; queued messages wait for the new pods."
      confirmLabel="Restart"
      confirmDisabled={busy}
      onConfirm={() => void restart()}
      onCancel={onClose}
    >
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </ConfirmDialog>
  )
}
