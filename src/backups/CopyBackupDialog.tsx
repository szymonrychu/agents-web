/** "Copy to...": copies a backup version (or the current one) to a target name. Replace only: no merge. */
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { copyBackup } from '../api/backups'
import type { BackupVersionView } from '../api/backups'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'

export interface CopyBackupDialogProps {
  open: boolean
  source: string
  /** Left out: the source's current version. */
  sourceVersion?: string
  onClose: () => void
  onCopied: (created: BackupVersionView) => void
}

export function CopyBackupDialog({ open, source, sourceVersion, onClose, onCopied }: CopyBackupDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="copy-backup-title">
      {/* the form is mounted only while the dialog is open, so every opening starts empty */}
      <CopyForm source={source} sourceVersion={sourceVersion} onClose={onClose} onCopied={onCopied} />
    </Dialog>
  )
}

function CopyForm({ source, sourceVersion, onClose, onCopied }: Omit<CopyBackupDialogProps, 'open'>) {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormErrorValue>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      onCopied(await copyBackup({ source, sourceVersion, target: target.trim() }))
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle id="copy-backup-title">Copy backup</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <DialogContentText>
          {`Copies ${source}${sourceVersion ? ` (version ${sourceVersion})` : ''} to the target name. Replaces the current version of the target; the previous one stays as a version.`}
        </DialogContentText>
        <TextField autoFocus size="small" label="Target name" value={target} onChange={(e) => setTarget(e.target.value)} fullWidth />
        <FormError error={error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || target.trim() === ''} onClick={() => void submit()}>Copy</Button>
      </DialogActions>
    </>
  )
}
