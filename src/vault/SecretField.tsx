import { useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'

export interface SecretFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Offer a "Load from file" button that reads a file into the field (for B64 keys). */
  loadFromFile?: boolean
  error?: boolean
  helperText?: string
}

/** A password field that never echoes its value, with an optional load-from-file button. */
export function SecretField({ label, value, onChange, loadFromFile = true, error, helperText }: SecretFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const load = async (file: File | undefined) => {
    if (!file) return
    onChange((await file.text()).replace(/[\r\n]+$/, ''))
    if (input.current) input.current.value = ''
  }
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexGrow: 1 }}>
      <TextField
        size="small"
        type="password"
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        helperText={helperText}
        autoComplete="off"
        sx={{ flexGrow: 1 }}
      />
      {loadFromFile && (
        <>
          <Button size="small" onClick={() => input.current?.click()} aria-label={`Load ${label} from file`}>Load from file</Button>
          <input ref={input} type="file" hidden data-testid={`file-${label}`} onChange={(e) => void load(e.target.files?.[0])} />
        </>
      )}
    </Box>
  )
}
