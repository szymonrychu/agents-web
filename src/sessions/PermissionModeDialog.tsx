/** Per-session permission mode override: Allow all or Auto, rolled out by the normal config rollout. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getMeta, putPermissionMode } from '../api/client'
import type { Meta, PermissionMode, PermissionModeView, SessionView } from '../api/client'

export interface PermissionModeDialogProps {
  open: boolean
  session: SessionView
  onClose: () => void
}

/** The stored mode; an unset one is the wrapper default, Allow all. */
const currentMode = (session: SessionView): PermissionMode => session.spec.wrapper?.permission_mode ?? 'bypassPermissions'

export function PermissionModeDialog({ open, session, onClose }: PermissionModeDialogProps) {
  const [options, setOptions] = useState<Meta['permission_modes']>([])
  const [stored, setStored] = useState<PermissionMode>(currentMode(session))
  const [mode, setMode] = useState<PermissionMode>(currentMode(session))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<PermissionModeView | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getMeta()
      .then((m) => {
        if (!cancelled) setOptions(m.permission_modes)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function apply() {
    setError(null)
    setSaving(true)
    try {
      const v = await putPermissionMode(session.id, mode)
      setStored(v.permission_mode)
      setMode(v.permission_mode)
      setSaved(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Permissions - {session.slug}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select size="small" label="Permission mode" value={options.length > 0 ? mode : ''} onChange={(e) => { setMode(e.target.value as PermissionMode); setSaved(null) }} fullWidth>
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          Applying restarts the agents with the new mode: idle agents restart now, busy agents after their turn ends. Allow all runs every action; Auto has a classifier review actions.
        </Typography>
        {saved && (
          <Alert severity="success">
            <div>Saved</div>
            {saved.preset_updated && saved.preset_name && <div>Preset {saved.preset_name} updated</div>}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={saving || options.length === 0 || mode === stored} onClick={() => void apply()}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}
