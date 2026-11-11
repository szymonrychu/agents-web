/** New session dialog: choose a preset and optionally name the session; the server snapshots the preset's spec. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { createSession, listPresets } from '../api/client'
import type { SessionView, CreateSession, PresetView } from '../api/client'
import { useProject } from '../projects/ProjectContext'
import { ProjectField } from '../projects/ProjectField'
import { MAX_SLUG } from './sessionSpecForm'

export interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (session: SessionView) => void
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function DialogBody({ onClose, onCreated }: Omit<NewSessionDialogProps, 'open'>) {
  const selected = useProject().project
  const [presets, setPresets] = useState<PresetView[]>([])
  const [presetId, setPresetId] = useState('')
  const [project, setProject] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    listPresets(selected)
      .then((list) => {
        if (cancelled) return
        setPresets(list)
        const first = list.find((p) => p.is_default) ?? list[0]
        setPresetId(first?.id ?? '')
        setProject(first?.project ?? '')
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(message(e))
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const slugTooLong = slug.length > MAX_SLUG

  // the session defaults to the project of the chosen preset; the user may pick another
  function choosePreset(id: string) {
    setPresetId(id)
    setProject(presets.find((p) => p.id === id)?.project ?? project)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const body: CreateSession = slug === '' ? { preset_id: presetId, project } : { preset_id: presetId, project, slug }
      onCreated(await createSession(body))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle>New session</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error" variant="outlined">{error}</Alert>}
          <TextField select size="small" label="Preset" value={presetId} onChange={(e) => choosePreset(e.target.value)} fullWidth>
            {presets.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
          <ProjectField value={project} onChange={setProject} />
          <TextField
            size="small"
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={slugTooLong}
            helperText={slugTooLong ? `Slug must be at most ${MAX_SLUG} characters` : 'An empty slug is generated from the preset name'}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" disabled={presetId === '' || project === '' || slugTooLong || busy} onClick={() => void submit()}>Create</Button>
      </DialogActions>
    </>
  )
}

/**
 * @param props see NewSessionDialogProps.
 * @returns the dialog element; its body remounts on every open so it reloads the presets and starts fresh.
 */
export function NewSessionDialog({ open, ...rest }: NewSessionDialogProps) {
  return (
    <Dialog open={open} onClose={rest.onClose} fullWidth maxWidth="xs" aria-label="New session">
      <DialogBody {...rest} />
    </Dialog>
  )
}
