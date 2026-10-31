/** Session init scripts: how the session was initialised (run state, log tail, paths) and an editor for the next session. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormHelperText from '@mui/material/FormHelperText'
import Typography from '@mui/material/Typography'
import { getInitScripts, putInitScripts } from '../api/client'
import type { SessionView, InitScriptsView } from '../api/client'
import EntryList from '../common/EntryList'
import { TOKENS } from '../theme'
import { previewFor } from './previewFor'
import { initScriptErrors } from './sessionSpecForm'

export interface InitScriptsDialogProps {
  open: boolean
  session: SessionView
  onClose: () => void
}

function RunState({ status }: { status: InitScriptsView['status'] }) {
  if (!status) return <Typography color="text.secondary">No run recorded for this session.</Typography>
  const detail = [
    status.exit_code != null ? `exit code ${status.exit_code}` : null,
    status.reason ? `reason: ${status.reason}` : null,
    status.started_at ? `started ${status.started_at}` : null,
    status.finished_at ? `finished ${status.finished_at}` : null,
  ].filter(Boolean)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography component="span" sx={{ fontWeight: TOKENS.fontWeights.medium, color: status.state === 'failed' ? 'error.main' : 'text.primary' }}>{status.state}</Typography>
        {detail.length > 0 && <Typography component="span" variant="body2" color="text.secondary">{detail.join(', ')}</Typography>}
      </Box>
      {status.log_tail ? (
        <Box component="pre" aria-label="Init log tail" sx={{ m: 0, p: 1, maxHeight: 240, overflow: 'auto', fontFamily: 'monospace', fontSize: `${TOKENS.fontSizes.sm / 16}rem`, border: `${TOKENS.borderWidth}px solid ${TOKENS.border}`, whiteSpace: 'pre-wrap' }}>{status.log_tail}</Box>
      ) : null}
    </Box>
  )
}

export function InitScriptsDialog({ open, session, onClose }: InitScriptsDialogProps) {
  const [view, setView] = useState<InitScriptsView | null>(null)
  const [scripts, setScripts] = useState<string[]>([])
  const [errors, setErrors] = useState<(string | undefined)[] | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<InitScriptsView | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getInitScripts(session.id)
      .then((v) => {
        if (cancelled) return
        setView(v)
        setScripts([...v.scripts])
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [open, session.id])

  const change = (next: string[]) => {
    setScripts(next)
    setErrors(undefined)
    setSaved(null)
  }

  async function save() {
    const found = initScriptErrors(scripts)
    setErrors(found)
    if (found) return
    setError(null)
    setSaving(true)
    try {
      const v = await putInitScripts(session.id, scripts)
      setView(v)
      setScripts([...v.scripts])
      setSaved(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Init scripts - {session.slug}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {view && (
          <>
            <RunState status={view.status} />
            <Typography variant="body2" color="text.secondary">
              Scripts in the workdir: <Box component="span" sx={{ fontFamily: 'monospace' }}>{view.script_path}</Box>
            </Typography>
            {view.edited_since_run && <Alert severity="info">The scripts were edited since the run; the log above shows the earlier version.</Alert>}
            <EntryList label="Init script" entries={scripts} onChange={change} preview={previewFor('init_script')} />
            {errors?.map((m, i) => (m ? <FormHelperText key={i} error>{m}</FormHelperText> : null))}
            {saved && (
              <Alert severity="success">
                <div>Saved. Applies to the next session</div>
                {saved.preset_updated && saved.preset_name && <div>Preset {saved.preset_name} updated</div>}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!view || saving} onClick={() => void save()}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
