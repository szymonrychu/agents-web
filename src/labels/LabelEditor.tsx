import { useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import { normalizeLabels } from './labels'

export interface LabelEditorProps {
  value: string[]
  onChange: (labels: string[]) => void
  /** Suggestions; anything valid can still be typed. */
  options?: string[]
  label?: string
  size?: 'small' | 'medium'
}

/** Free-form multi-label input; entries are normalised like the server and a bad entry is rejected inline. */
export function LabelEditor({ value, onChange, options = [], label = 'Labels', size = 'small' }: LabelEditorProps) {
  const [error, setError] = useState<string | null>(null)
  return (
    <Autocomplete
      multiple
      freeSolo
      size={size}
      options={options}
      value={value}
      onChange={(_, next) => {
        const r = normalizeLabels(next)
        if (!r.ok) {
          setError(r.error)
          return
        }
        setError(null)
        onChange(r.labels)
      }}
      renderValue={(labels, getItemProps) =>
        labels.map((l, index) => {
          const { key, ...props } = getItemProps({ index })
          return <Chip key={key} size="small" variant="outlined" label={l} {...props} />
        })
      }
      renderInput={(params) => <TextField {...params} label={label} error={error !== null} helperText={error ?? undefined} />}
    />
  )
}
