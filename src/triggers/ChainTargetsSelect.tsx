import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { useEffect, useState } from 'react'
import { listSchedules } from '../schedules/api'

export const MAX_CHAIN_TARGETS = 10
export const CHAIN_HELP = 'Each runs once when a session of this schedule finishes after a handled run. A disabled schedule still runs when chained.'

export interface ChainTargetsSelectProps {
  /** Target schedule ids, in order. */
  value: string[]
  onChange: (ids: string[]) => void
  /** A schedule that cannot be its own target. */
  excludeId?: string
  helperText?: string
}

interface Option { id: string; name: string }

/** "Then run": a multi-select of schedules. Unknown ids stay selected (shown by id) so a save never drops them. */
export function ChainTargetsSelect({ value, onChange, excludeId, helperText = CHAIN_HELP }: ChainTargetsSelectProps) {
  const [options, setOptions] = useState<Option[]>([])
  useEffect(() => {
    let live = true
    listSchedules().then((list) => { if (live) setOptions(list.map((s) => ({ id: s.id, name: s.name }))) }, () => {})
    return () => { live = false }
  }, [])
  const choices = options.filter((o) => o.id !== excludeId)
  const selected = value.map((id) => options.find((o) => o.id === id) ?? { id, name: id })
  const full = value.length >= MAX_CHAIN_TARGETS
  return (
    <Autocomplete
      multiple size="small" options={choices} value={selected}
      getOptionLabel={(o) => o.name} isOptionEqualToValue={(a, b) => a.id === b.id}
      filterSelectedOptions
      getOptionDisabled={() => full}
      onChange={(_, next) => onChange(next.map((o) => o.id))}
      renderInput={(params) => <TextField {...params} label="Then run" helperText={full ? `${helperText} At most ${MAX_CHAIN_TARGETS} targets.` : `${helperText} Up to ${MAX_CHAIN_TARGETS}.`} />}
    />
  )
}
