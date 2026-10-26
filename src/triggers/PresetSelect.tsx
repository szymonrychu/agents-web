import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { listPresets } from '../api/client'
import type { PresetView } from '../api/client'

export interface PresetSelectProps {
  value: string
  onChange: (presetId: string) => void
  disabled?: boolean
  /** When set, adds an empty choice (value '') with this label, e.g. "Default preset". */
  emptyLabel?: string
}

/** Picks a preset from the orchestrator's `GET /presets`; shows the default mark, loading and error states. */
export function PresetSelect({ value, onChange, disabled, emptyLabel }: PresetSelectProps) {
  const [presets, setPresets] = useState<PresetView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPresets()
      .then((list) => !cancelled && setPresets(list))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])

  if (error !== null) return <Alert severity="error">Could not load presets: {error}</Alert>
  const loading = presets === null
  return (
    <TextField
      select
      size="small"
      label="Preset"
      value={loading ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      helperText={loading ? 'Loading presets...' : undefined}
      fullWidth
    >
      {emptyLabel !== undefined && <MenuItem value="">{emptyLabel}</MenuItem>}
      {(presets ?? []).map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {p.name}
          {p.is_default && <Chip size="small" label="default" sx={{ ml: 1 }} />}
        </MenuItem>
      ))}
    </TextField>
  )
}
