import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { FormError } from '../triggers'
import { createEntry } from './api'
import type { EntryView } from './api'
import { SecretField } from './SecretField'
import { envNameError, MAX_ENVS, parseLabels } from './validate'

export interface EnvRowInit {
  env: string
  protected: boolean
  value: string
}
export interface EntryInit {
  name: string
  description: string
  labels: string[]
  envs: EnvRowInit[]
}

interface Row extends EnvRowInit {
  key: number
}

/** The prefill for "Duplicate as new": protected values stay empty, readable values are copied. */
export const duplicateInit = (e: EntryView): EntryInit => ({
  name: `${e.name} copy`,
  description: e.description,
  labels: e.labels,
  envs: e.envs.map((v) => ({ env: v.env, protected: v.protected, value: v.protected ? '' : (v.value ?? '') })),
})

const BLANK: EntryInit = { name: '', description: '', labels: [], envs: [{ env: '', protected: false, value: '' }] }

export interface EntryDialogProps {
  /** Prefill; omitted for a blank create dialog. */
  init?: EntryInit
  onClose: () => void
  onCreated: (e: EntryView) => void
}

/** Create dialog. Mount it only while open: closing unmounts the form and with it every typed secret. */
export function EntryDialog({ init = BLANK, onClose, onCreated }: EntryDialogProps) {
  const [name, setName] = useState(init.name)
  const [description, setDescription] = useState(init.description)
  const [labels, setLabels] = useState(init.labels.join(', '))
  const [next, setNext] = useState(init.envs.length)
  const [rows, setRows] = useState<Row[]>(init.envs.map((r, i) => ({ ...r, key: i })))
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)

  const patch = (key: number, p: Partial<EnvRowInit>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const nameErrors = rows.map((r, i) => (r.env === '' ? undefined : envNameError(r.env, rows.filter((_, j) => j !== i).map((o) => o.env))))
  const missingProtected = rows.some((r) => r.protected && r.value === '')
  const valid = name.trim() !== '' && rows.length >= 1 && rows.every((r, i) => envNameError(r.env, rows.filter((_, j) => j !== i).map((o) => o.env)) === undefined) && !missingProtected

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const created = await createEntry({
        name: name.trim(),
        description,
        labels: parseLabels(labels),
        envs: rows.map((r) => ({ env: r.env, protected: r.protected, value: r.value })),
      })
      onCreated(created)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{init === BLANK ? 'New vault entry' : 'New vault entry (prefilled)'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
        <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField size="small" label="Labels" helperText="Comma separated" value={labels} onChange={(e) => setLabels(e.target.value)} />
        {rows.map((r, i) => (
          <Box key={r.key} role="group" aria-label={`Env row ${i + 1}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              size="small"
              label="Env name"
              value={r.env}
              onChange={(e) => patch(r.key, { env: e.target.value })}
              error={nameErrors[i] !== undefined}
              helperText={nameErrors[i]}
              sx={{ minWidth: 220 }}
            />
            <FormControlLabel
              control={<Switch checked={r.protected} onChange={(e) => patch(r.key, { protected: e.target.checked })} />}
              label="Protected"
            />
            {r.protected ? (
              <SecretField label="Value" value={r.value} onChange={(value) => patch(r.key, { value })} />
            ) : (
              <TextField size="small" label="Value" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} sx={{ flexGrow: 1 }} />
            )}
            <IconButton aria-label={`Remove env ${i + 1}`} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((o) => o.key !== r.key))}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box>
          <Button
            startIcon={<AddIcon />}
            disabled={rows.length >= MAX_ENVS}
            onClick={() => {
              setRows((rs) => [...rs, { key: next, env: '', protected: false, value: '' }])
              setNext(next + 1)
            }}
          >
            Add env
          </Button>
        </Box>
        <FormError error={error instanceof Error ? error : undefined} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || busy} onClick={() => void submit()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}
