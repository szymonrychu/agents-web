/** Node search: scope (own project or all), mode (hybrid, lexical, semantic) and a hit list. Snippets render as plain text. */
import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { FormError } from '../triggers'
import { searchNodes } from './api'
import type { HitView, SearchMode, SearchResponse, SearchScope } from './api'

const MODES: SearchMode[] = ['hybrid', 'lexical', 'semantic']

export interface SearchBoxProps {
  /** The selected project; `own` scope searches it, `all` searches every project. */
  project: string | null
  onOpen: (hit: HitView) => void
}

export function SearchBox({ project, onOpen }: SearchBoxProps) {
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<SearchScope>('own')
  const [mode, setMode] = useState<SearchMode>('hybrid')
  const [result, setResult] = useState<SearchResponse>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    if (text === '') return
    setBusy(true)
    setError(undefined)
    try {
      setResult(await searchNodes({ q: text, project, scope, mode }))
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack component="form" role="search" spacing={1} onSubmit={(e) => void submit(e)}>
      <TextField size="small" type="search" label="Search nodes" value={q} onChange={(e) => setQ(e.target.value)} slotProps={{ htmlInput: { role: 'searchbox' } }} />
      <ToggleButtonGroup size="small" exclusive fullWidth aria-label="Search scope" value={scope} onChange={(_, v: SearchScope | null) => v && setScope(v)}>
        <ToggleButton value="own">This project</ToggleButton>
        <ToggleButton value="all">All projects</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup size="small" exclusive fullWidth aria-label="Search mode" value={mode} onChange={(_, v: SearchMode | null) => v && setMode(v)}>
        {MODES.map((m) => <ToggleButton key={m} value={m}>{m}</ToggleButton>)}
      </ToggleButtonGroup>
      <Button type="submit" size="small" variant="outlined" disabled={busy}>Search</Button>
      <FormError error={error instanceof Error ? error : undefined} />
      {result && !result.semantic && <Alert severity="info">Results are lexical only: the embedder is unavailable.</Alert>}
      {result && (
        <List dense disablePadding aria-label="Search results">
          {result.items.map((h) => (
            <ListItemButton key={h.key} onClick={() => onOpen(h)}>
              <ListItemText primary={h.topic} secondary={h.snippet} slotProps={{ secondary: { sx: { wordBreak: 'break-word' } } }} />
            </ListItemButton>
          ))}
          {result.items.length === 0 && <ListItemText secondary="No matches" sx={{ px: 1 }} />}
        </List>
      )}
    </Stack>
  )
}
