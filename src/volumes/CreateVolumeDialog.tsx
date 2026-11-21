/** Create dialog: name, projects, size (up to the /meta cap), description, labels, backup excludes. */
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { getMeta } from '../api/client'
import { listProjects } from '../projects/api'
import { FormError } from '../triggers'
import { createVolume, parseLines, parseSize, volumeErrorText } from './api'
import type { MetaCaps, VolumeView } from './api'

export const NAME_GRAMMAR = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
export const EXCLUDE_HINT = 'Globs relative to the volume root. They only shrink the S3 backups; the mounted volume is not affected.'

export function CreateVolumeDialog({ caps, onClose, onCreated }: { caps?: MetaCaps; onClose: () => void; onCreated: (v: VolumeView) => void }) {
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [options, setOptions] = useState<string[]>([])
  const [size, setSize] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState('')
  const [exclude, setExclude] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listProjects().then((ps) => setOptions(ps.map((p) => p.slug)), () => setOptions([]))
  }, [])

  const sizeBytes = size.trim() === '' ? undefined : parseSize(size)
  const max = caps ? parseSize(caps.volume_max_size) : NaN
  const sizeError = sizeBytes === undefined ? undefined : Number.isNaN(sizeBytes) ? 'Use a quantity such as 10Gi' : sizeBytes > max ? `At most ${caps?.volume_max_size}` : undefined
  const nameError = name !== '' && !NAME_GRAMMAR.test(name) ? 'Lowercase letters, digits and hyphens, 1-40 characters, no hyphen at either end' : undefined
  const valid = NAME_GRAMMAR.test(name) && projects.length > 0 && sizeError === undefined

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const body = { name, projects, description, labels: parseLines(labels), exclude: parseLines(exclude), ...(size.trim() ? { size: size.trim() } : {}) }
      onCreated(await createVolume(body))
    } catch (e) {
      setError(volumeErrorText(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="create-volume-title">
      <DialogTitle id="create-volume-title">New volume</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={nameError !== undefined} helperText={nameError ?? 'Lowercase letters, digits, hyphens; up to 40 characters'} sx={{ mt: 1 }} />
        <Autocomplete multiple size="small" options={options} value={projects} onChange={(_, v) => setProjects(v)} renderInput={(p) => <TextField {...p} label="Projects" />} />
        <TextField
          size="small"
          label="Size"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          error={sizeError !== undefined}
          helperText={sizeError ?? (caps ? `Default ${caps.volume_default_size}, at most ${caps.volume_max_size}` : undefined)}
        />
        <TextField size="small" label="Storage class" value={caps?.volume_storage_class ?? ''} slotProps={{ input: { readOnly: true } }} />
        <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField size="small" label="Labels" helperText="Comma separated" value={labels} onChange={(e) => setLabels(e.target.value)} />
        <TextField size="small" label="Backup excludes" multiline minRows={2} helperText={EXCLUDE_HINT} value={exclude} onChange={(e) => setExclude(e.target.value)} />
        <FormError error={error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || busy} onClick={() => void submit()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Loads the volume caps of /meta once. */
export function useCaps(): MetaCaps | undefined {
  const [caps, setCaps] = useState<MetaCaps>()
  useEffect(() => {
    getMeta().then((m) => setCaps(m.caps), () => setCaps(undefined))
  }, [])
  return caps
}
