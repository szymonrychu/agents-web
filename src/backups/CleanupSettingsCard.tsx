/** Settings > Backups: the stored cleanup (sweep) policy, edited in place and saved as a whole. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { getCleanupSettings, putCleanupSettings } from '../api/archives'
import type { CleanupSettingsView, SweepPolicyIn } from '../api/archives'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'

type NumberKey = 'retention_days' | 'keep_newest' | 'interval_seconds' | 'grace_seconds'

/** Same bounds as the orchestrator (`settings.py` SWEEP_*_MAX and the SQL CHECKs). */
const FIELDS: { key: NumberKey; label: string; min: number; max: number }[] = [
  { key: 'retention_days', label: 'Retention (days)', min: 1, max: 3650 },
  { key: 'keep_newest', label: 'Keep newest per name', min: 1, max: 1000 },
  { key: 'interval_seconds', label: 'Interval (seconds)', min: 60, max: 2592000 },
  { key: 'grace_seconds', label: 'Grace (seconds)', min: 0, max: 604800 },
]

/** The form keeps number inputs as strings so a half-typed value is not rewritten under the cursor. */
interface Form {
  enabled: boolean
  dry_run: boolean
  retention_days: string
  keep_newest: string
  interval_seconds: string
  grace_seconds: string
}

const toForm = (p: SweepPolicyIn): Form => ({
  enabled: p.enabled,
  dry_run: p.dry_run,
  retention_days: String(p.retention_days),
  keep_newest: String(p.keep_newest),
  interval_seconds: String(p.interval_seconds),
  grace_seconds: String(p.grace_seconds),
})

const parse = (text: string): number => (text.trim() === '' ? NaN : Number(text))
const inRange = (text: string, min: number, max: number) => {
  const n = parse(text)
  return Number.isInteger(n) && n >= min && n <= max
}

const toPolicy = (f: Form): SweepPolicyIn => ({
  enabled: f.enabled,
  dry_run: f.dry_run,
  retention_days: parse(f.retention_days),
  keep_newest: parse(f.keep_newest),
  interval_seconds: parse(f.interval_seconds),
  grace_seconds: parse(f.grace_seconds),
})

const caption = (view: CleanupSettingsView, now: number) => {
  if (view.source === 'environment') return 'Using deployment defaults (not saved)'
  return view.updated_at ? `Saved ${formatAge(now - Date.parse(view.updated_at))} ago` : 'Saved'
}

export function CleanupSettingsCard() {
  const now = useNow()
  const [view, setView] = useState<CleanupSettingsView | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<FormErrorValue>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCleanupSettings().then(
      (v) => {
        if (cancelled) return
        setView(v)
        setForm(toForm(v.policy))
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const stored = view ? toForm(view.policy) : null
  const dirty = form !== null && stored !== null && (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== stored[k])
  const valid = form !== null && FIELDS.every((f) => inRange(form[f.key], f.min, f.max))
  const realDeletes = view?.policy.dry_run === true && form?.dry_run === false

  const save = async () => {
    if (!form) return
    setConfirming(false)
    setSaving(true)
    setError(null)
    try {
      const next = await putCleanupSettings(toPolicy(form))
      setView(next)
      setForm(toForm(next.policy))
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper variant="outlined" aria-label="Cleanup settings" role="region" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md }}>Cleanup settings</Typography>
        {view && <Typography variant="caption" color="text.secondary">{caption(view, now)}</Typography>}
      </Box>
      <FormError error={error} />
      {view && form && (
        <>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(_, enabled) => setForm({ ...form, enabled })} />} label="Sweep enabled" />
            <FormControlLabel control={<Switch checked={form.dry_run} onChange={(_, dry_run) => setForm({ ...form, dry_run })} />} label="Dry run" />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {FIELDS.map((f) => {
              const bad = !inRange(form[f.key], f.min, f.max)
              return (
                <TextField
                  key={f.key} size="small" type="number" label={f.label} value={form[f.key]} error={bad}
                  helperText={bad ? `Must be ${f.min} to ${f.max}` : `default ${view.defaults[f.key]}`}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  slotProps={{ htmlInput: { min: f.min, max: f.max, step: 1 } }}
                />
              )
            })}
          </Box>
          <Box>
            <Button variant="contained" disabled={!dirty || !valid || saving} onClick={() => (realDeletes ? setConfirming(true) : void save())}>Save</Button>
          </Box>
        </>
      )}
      <ConfirmDialog
        open={confirming} title="Enable real deletes?" confirmLabel="Enable real deletes"
        body="With dry run off the sweep permanently deletes the archives it selects from S3. Archives a live session references are still kept."
        onConfirm={() => void save()} onCancel={() => setConfirming(false)}
      />
    </Paper>
  )
}
