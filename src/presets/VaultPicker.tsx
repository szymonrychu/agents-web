/** "Add from vault" dialog: pick an entry, choose its envs and the preset env name each one gets. */
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { LabelChips } from '../labels/LabelChips'
import { envKeyError, envRow, vaultRow } from '../sessions/sessionSpecForm'
import type { EnvRow } from '../sessions/sessionSpecForm'
import type { EntryView } from '../vault/api'
import { entryAllowed, projectScope } from '../vault/refs'

export interface VaultPickerProps {
  entries: EntryView[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
  /** The preset's labels plus `project:<project>`. */
  target: string[]
  existingKeys: string[]
  onAdd: (rows: EnvRow[]) => void
  onClose: () => void
}

function matches(entry: EntryView, needle: string): boolean {
  const hay = [entry.name, entry.description, ...entry.labels, ...entry.envs.map((e) => e.env)]
  return hay.some((s) => s.toLowerCase().includes(needle))
}

export function VaultPicker({ entries, status, error, target, existingKeys, onAdd, onClose }: VaultPickerProps) {
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<EntryView | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [names, setNames] = useState<Record<string, string>>({})

  const nameOf = (env: string) => names[env] ?? env
  const picked = chosen ? chosen.envs.filter((e) => checked[e.env]) : []
  const pickedRows = picked.map((e) => envRow(nameOf(e.env)))
  const blocked = picked.length === 0 || pickedRows.some((r) => envKeyError(r.key, pickedRows))

  const choose = (entry: EntryView) => {
    setChosen(entry)
    setChecked({})
    setNames({})
  }
  const add = () => {
    if (!chosen || blocked) return
    onAdd(picked.map((e) => vaultRow(nameOf(e.env), { vault: chosen.id, env: e.env })))
  }

  const needle = search.trim().toLowerCase()
  const visible = entries.filter((e) => matches(e, needle))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add from vault</DialogTitle>
      <DialogContent>
        {status === 'loading' && <Typography variant="body2">Loading vault entries...</Typography>}
        {status === 'error' && <Alert severity="error">{error ?? 'Could not load vault entries'}</Alert>}
        {status === 'ready' && chosen === null && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
            <TextField size="small" label="Search entries" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth />
            <List dense disablePadding>
              {visible.map((entry) => {
                const allowed = entryAllowed(entry.labels, target)
                return (
                  <ListItemButton key={entry.id} aria-label={`Entry ${entry.name}`} disabled={!allowed} onClick={() => choose(entry)}>
                    <ListItemText
                      primary={entry.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {entry.description && <span>{entry.description}</span>}
                          <LabelChips labels={entry.labels} />
                          <span>{entry.envs.map((e) => e.env).join(', ')}</span>
                          {!allowed && <span>{`Only for ${projectScope(entry.labels).join(', ')}`}</span>}
                        </Box>
                      }
                      slotProps={{ secondary: { component: 'div' } }}
                    />
                  </ListItemButton>
                )
              })}
            </List>
            {visible.length === 0 && <Typography variant="body2">No matching entries</Typography>}
          </Box>
        )}
        {status === 'ready' && chosen !== null && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="subtitle2">{chosen.name}</Typography>
            {chosen.envs.map((e) => {
              const on = Boolean(checked[e.env])
              const name = nameOf(e.env)
              const err = on ? envKeyError(name, pickedRows) : undefined
              const replaces = on && !err && existingKeys.includes(name)
              return (
                <Box key={e.env} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Checkbox size="small" checked={on} onChange={(ev) => setChecked({ ...checked, [e.env]: ev.target.checked })} slotProps={{ input: { 'aria-label': `Use ${e.env}` } }} />
                  <Box sx={{ flex: '1 1 8rem', pt: 1 }}>
                    <Typography variant="body2">{e.env}</Typography>
                    {e.protected || e.value === null ? <Chip size="small" label="protected" /> : <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{e.value}</Typography>}
                  </Box>
                  <TextField
                    size="small"
                    label={`Preset env for ${e.env}`}
                    value={name}
                    onChange={(ev) => setNames({ ...names, [e.env]: ev.target.value })}
                    error={Boolean(err)}
                    helperText={err ?? (replaces ? 'Replaces the existing variable' : undefined)}
                    sx={{ flex: '1 1 12rem' }}
                  />
                </Box>
              )
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {chosen !== null && <Button onClick={() => setChosen(null)}>Back</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={add} disabled={chosen === null || blocked}>Add</Button>
      </DialogActions>
    </Dialog>
  )
}
