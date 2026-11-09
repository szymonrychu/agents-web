import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { FormError } from '../triggers'
import { errorAttachments, isOrchestratorUnavailable, patchEntry } from './api'
import type { DeleteAttachment, EntryPatch, EntryView } from './api'
import { parseLabels } from './validate'

export interface EditDialogProps {
  entry: EntryView
  onClose: () => void
  onSaved: () => void
}

/** Rename, describe, relabel and edit readable values. Protected envs are rotated, not edited. */
export function EditDialog({ entry, onClose, onSaved }: EditDialogProps) {
  const readable = entry.envs.filter((e) => !e.protected)
  const [name, setName] = useState(entry.name)
  const [description, setDescription] = useState(entry.description)
  const [labels, setLabels] = useState(entry.labels.join(', '))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(readable.map((e) => [e.env, e.value ?? ''])))
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [attached, setAttached] = useState<DeleteAttachment[]>()

  const submit = async (force = false) => {
    const patch: EntryPatch = {}
    if (name.trim() !== entry.name) patch.name = name.trim()
    if (description !== entry.description) patch.description = description
    const nextLabels = parseLabels(labels)
    if (nextLabels.join('\n') !== entry.labels.join('\n')) patch.labels = nextLabels
    const changed = readable.filter((e) => values[e.env] !== (e.value ?? ''))
    if (changed.length > 0) patch.envs = Object.fromEntries(changed.map((e) => [e.env, values[e.env]]))
    if (Object.keys(patch).length === 0) return onClose()
    setBusy(true)
    setError(undefined)
    setAttached(undefined)
    try {
      await (force ? patchEntry(entry.id, patch, true) : patchEntry(entry.id, patch))
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'vault_entry_attached') setAttached(errorAttachments(e))
      else setError(e)
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit {entry.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
        <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField size="small" label="Labels" helperText="Comma separated" value={labels} onChange={(e) => setLabels(e.target.value)} />
        {readable.map((e) => (
          <TextField key={e.env} size="small" label={e.env} value={values[e.env]} onChange={(ev) => setValues((o) => ({ ...o, [e.env]: ev.target.value }))} />
        ))}
        {entry.envs.some((e) => e.protected) && (
          <Typography variant="body2" color="text.secondary">Protected envs are changed with Rotate.</Typography>
        )}
        {isOrchestratorUnavailable(error) ? (
          <Typography role="alert" color="error">
            The orchestrator is unavailable, so the presets using this entry could not be checked. Nothing was changed. Try again in a moment.
          </Typography>
        ) : (
          <FormError error={error instanceof Error ? error : undefined} />
        )}
        {attached && (
          <>
            <Typography role="alert" color="warning.main">
              This label change affects presets that use this entry. Save anyway to apply it.
            </Typography>
            {attached.length > 0 && (
              <ul aria-label="Attachments" style={{ margin: 0 }}>
                {attached.map((a) => (
                  <li key={`${a.preset_id}/${a.env}`}>{a.preset_name}: {a.env} from {a.entry_env}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || name.trim() === ''} onClick={() => void submit(attached !== undefined)}>
          {attached ? 'Save anyway' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
