/** Moves a live session to another project (the actions menu "Move to project"); the server's 409 and 422 reasons are shown. */
import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { moveSessionProject } from '../api/client'
import type { SessionView } from '../api/client'
import { ProjectField } from '../projects/ProjectField'
import { FormError } from '../triggers'

export interface MoveProjectDialogProps {
  open: boolean
  session: SessionView
  onClose: () => void
  onMoved: (session: SessionView) => void
}

export function MoveProjectDialog({ open, session, onClose, onMoved }: MoveProjectDialogProps) {
  const [project, setProject] = useState(session.project)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onMoved(await moveSessionProject(session.id, project))
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-label="Move to project">
      <DialogTitle>{`Move ${session.slug} to project`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <FormError error={error} />
        <ProjectField value={project} onChange={setProject} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" disabled={busy || project === session.project} onClick={() => void submit()}>Move</Button>
      </DialogActions>
    </Dialog>
  )
}
