/** Create or edit a schedule: cron with a live next-fires preview, timezone, preset, prompt and enabled flag. */
import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { FormError, PresetSelect } from '../triggers'
import { createSchedule, previewSchedule, updateSchedule } from './api'
import type { ScheduleView } from './api'

export interface ScheduleFormProps {
  schedule?: ScheduleView
  onSaved: (schedule: ScheduleView) => void
  onCancel: () => void
}

type Field = 'name' | 'cron' | 'timezone' | 'preset'
type FieldErrors = Partial<Record<Field, string>>
interface Preview { key: string; fires: string[]; errors: FieldErrors }

const DEFAULT_TIMEZONE = 'Europe/Warsaw'
const DEBOUNCE_MS = 300
const FIELD_OF_CODE: Record<string, Field> = {
  conflict: 'name',
  invalid_cron: 'cron',
  invalid_timezone: 'timezone',
  unknown_preset: 'preset',
}

const timezones = (): string[] => {
  const zones = Intl.supportedValuesOf('timeZone')
  return zones.includes(DEFAULT_TIMEZONE) ? zones : [DEFAULT_TIMEZONE, ...zones]
}

/** `2026-10-27 07:00` in the zone, so the user reads the fire time where the schedule runs. */
const inZone = (iso: string, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ScheduleForm({ schedule, onSaved, onCancel }: ScheduleFormProps) {
  const [name, setName] = useState(schedule?.name ?? '')
  const [cron, setCron] = useState(schedule?.cron ?? '')
  const [timezone, setTimezone] = useState(schedule?.timezone ?? DEFAULT_TIMEZONE)
  const [presetId, setPresetId] = useState(schedule?.preset_id ?? '')
  const [prompt, setPrompt] = useState(schedule?.prompt ?? '')
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saveErrors, setSaveErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const zones = useMemo(() => timezones(), [])

  const previewKey = `${timezone}\n${cron.trim()}`

  useEffect(() => {
    if (cron.trim() === '') return
    let live = true
    const timer = setTimeout(() => {
      previewSchedule({ cron: cron.trim(), timezone }).then(
        (p) => { if (live) setPreview({ key: previewKey, fires: p.next_fires, errors: {} }) },
        (e: unknown) => {
          if (!live) return
          const field = e instanceof ApiError && e.status === 422 ? (FIELD_OF_CODE[e.code] ?? 'cron') : 'cron'
          setPreview({ key: previewKey, fires: [], errors: { [field]: e instanceof Error ? e.message : String(e) } })
        },
      )
    }, DEBOUNCE_MS)
    return () => { live = false; clearTimeout(timer) }
  }, [cron, timezone, previewKey])

  // A preview answers only the cron and timezone it was asked for; anything older is stale and not shown.
  const current = preview?.key === previewKey ? preview : null
  const fires = current?.fires ?? []
  const previewErrors = current?.errors ?? {}
  const err = (f: Field) => saveErrors[f] ?? previewErrors[f]
  const edit = <T,>(field: Field | null, set: (v: T) => void) => (v: T) => {
    set(v)
    if (field) setSaveErrors((s) => ({ ...s, [field]: undefined }))
    setFormError(null)
  }
  const valid = name.trim() !== '' && cron.trim() !== '' && presetId !== '' && prompt.trim() !== ''

  const submit = async () => {
    const body = { name: name.trim(), cron: cron.trim(), timezone, preset_id: presetId, prompt, enabled }
    setBusy(true)
    setSaveErrors({})
    setFormError(null)
    try {
      onSaved(schedule ? await updateSchedule(schedule.id, body) : await createSchedule(body))
    } catch (e) {
      const field = e instanceof ApiError ? FIELD_OF_CODE[e.code] : undefined
      if (field) setSaveErrors({ [field]: (e as Error).message })
      else setFormError(e)
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2}>
      <TextField
        size="small" label="Name" value={name} onChange={(e) => edit('name', setName)(e.target.value)}
        error={Boolean(err('name'))} helperText={err('name')} fullWidth
      />
      <TextField
        size="small" label="Cron" value={cron} onChange={(e) => edit('cron', setCron)(e.target.value)}
        error={Boolean(err('cron'))}
        helperText={err('cron') ?? 'Standard 5 fields: minute hour day-of-month month day-of-week, e.g. 0 6 * * 1-5 (no @daily macros)'}
        slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} fullWidth
      />
      <TextField
        select size="small" label="Timezone" value={timezone} onChange={(e) => edit('timezone', setTimezone)(e.target.value)}
        error={Boolean(err('timezone'))} helperText={err('timezone')} fullWidth
      >
        {zones.map((z) => <MenuItem key={z} value={z}>{z}</MenuItem>)}
      </TextField>
      {fires.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">Next fires ({timezone})</Typography>
          {fires.slice(0, 3).map((f) => <Typography key={f} variant="body2" sx={{ fontFamily: 'monospace' }}>{inZone(f, timezone)}</Typography>)}
        </Box>
      )}
      <Box>
        <PresetSelect value={presetId} onChange={edit('preset', setPresetId)} />
        {err('preset') && <FormHelperText error>{err('preset')}</FormHelperText>}
      </Box>
      <TextField
        label="Prompt" multiline minRows={4} value={prompt} onChange={(e) => edit(null, setPrompt)(e.target.value)}
        helperText="Sent to the agent on each fire. Placeholders: {schedule_name} and {fired_at} (ISO 8601, in the schedule's timezone)."
        slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} fullWidth
      />
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label="Enabled" />
      <FormError error={formError as never} />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!valid || busy}>Save</Button>
      </Stack>
    </Stack>
  )
}
