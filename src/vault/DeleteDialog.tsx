import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import { deleteEntry, errorAttachments } from './api'
import type { DeleteAttachment, EntryView } from './api'

export interface DeleteDialogProps {
  entry: EntryView
  onClose: () => void
  onDeleted: () => void
}

export function DeleteDialog({ entry, onClose, onDeleted }: DeleteDialogProps) {
  const [error, setError] = useState<unknown>()
  const [attachments, setAttachments] = useState<DeleteAttachment[]>([])
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await deleteEntry(entry.id)
      onDeleted()
    } catch (e) {
      setError(e)
      setAttachments(errorAttachments(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Delete {entry.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography>Delete this entry and all its values? This cannot be undone.</Typography>
        <FormError error={error instanceof Error ? error : undefined} />
        {attachments.length > 0 && (
          <>
            <Typography variant="subtitle2">Still attached to presets</Typography>
            <ul aria-label="Attachments" style={{ margin: 0 }}>
              {attachments.map((a) => (
                <li key={`${a.preset_id}/${a.env}`}>{a.preset_name}: {a.env} from {a.entry_env}</li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={busy} onClick={() => void submit()}>Delete</Button>
      </DialogActions>
    </Dialog>
  )
}
