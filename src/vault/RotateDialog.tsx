import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import { rotateEntry } from './api'
import type { EntryView } from './api'
import { SecretField } from './SecretField'

export interface RotateDialogProps {
  entry: EntryView
  onClose: () => void
  onRotated: (e: EntryView) => void
}

/** Rotates all protected envs at once. Mount it only while open so typed secrets are dropped on close. */
export function RotateDialog({ entry, onClose, onRotated }: RotateDialogProps) {
  const names = entry.envs.filter((e) => e.protected).map((e) => e.env)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(names.map((n) => [n, ''])))
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const complete = names.every((n) => values[n] !== '')

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      onRotated(await rotateEntry(entry.id, values))
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Rotate {entry.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {confirming ? (
          <Typography>
            Replace the values of {names.join(', ')} with new ones as version {entry.version + 1}? Running sessions keep the version they pinned.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">Every protected value is required.</Typography>
            {names.map((n) => (
              <Box key={n} sx={{ display: 'flex' }}>
                <SecretField label={n} value={values[n]} onChange={(v) => setValues((o) => ({ ...o, [n]: v }))} />
              </Box>
            ))}
          </>
        )}
        <FormError error={error instanceof Error ? error : undefined} />
      </DialogContent>
      <DialogActions>
        <Button onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? 'Back' : 'Cancel'}</Button>
        {confirming ? (
          <Button variant="contained" color="warning" disabled={busy} onClick={() => void submit()}>Confirm rotate</Button>
        ) : (
          <Button variant="contained" disabled={!complete} onClick={() => setConfirming(true)}>Rotate</Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
