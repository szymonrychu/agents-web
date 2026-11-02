/** Settings > Backups: the stored cleanup (sweep) policy, edited in place and saved as a whole. */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { getCleanupSettings, putCleanupSettings, runCleanupNow } from '../api/archives'
import type { CleanupSettingsView, SweepPolicyIn } from '../api/archives'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { formatBytes } from './format'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'

/** While a run request is pending the card re-reads the settings this often, at most `RUN_POLL_MAX_READS` times. */
export const RUN_POLL_MS = 5000
const RUN_POLL_MAX_READS = 6

type NumberKey = 'retention_days' | 'keep_newest' | 'interval_seconds' | 'grace_seconds'

/** Same bounds as the orchestrator (`settings.py` SWEEP_*_MAX and the SQL CHECKs). */
export const FIELDS: { key: NumberKey; label: string; min: number; max: number }[] = [
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

/** The last sweep as the orchestrator reported it; `last_sweep` is an untyped object, so every member is checked. */
const count = (v: unknown) => (typeof v === 'number' ? v : 0)
const stamp = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null)

/** One line for the last sweep. A sweep that failed says so instead of listing counts: the request is consumed either way. */
function sweepSummary(sweep: Record<string, unknown>, now: number): { line: string; error: string | null } {
  const at = stamp(sweep.finished_at) ?? stamp(sweep.started_at)
  const dry = sweep.dry_run === true
  const head = `Last sweep${at === null ? '' : ` ${formatAge(now - at)} ago`}${dry ? ' (dry run)' : ''}`
  if (typeof sweep.error === 'string' && sweep.error !== '') return { line: `${head} failed`, error: sweep.error }
  const failed = count(sweep.failed)
  const done = dry
    ? `would delete ${count(sweep.planned)} (${formatBytes(count(sweep.planned_bytes))})`
    : `deleted ${count(sweep.deleted)} (${formatBytes(count(sweep.deleted_bytes))})${failed > 0 ? `, ${failed} failed` : ''}`
  return { line: `${head}: listed ${count(sweep.listed)}, ${done}`, error: null }
}

export function CleanupSettingsCard() {
  const now = useNow()
  const [view, setView] = useState<CleanupSettingsView | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<FormErrorValue>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmingRun, setConfirmingRun] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [pollEpoch, setPollEpoch] = useState(0)
  const pending = view?.run_pending === true

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

  useEffect(() => {
    if (!pending) return
    let cancelled = false
    let reads = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      reads += 1
      try {
        const v = await getCleanupSettings()
        if (cancelled) return
        setView(v)
        if (!v.run_pending) return
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e : String(e))
      }
      if (reads >= RUN_POLL_MAX_READS) setStalled(true)
      else timer = setTimeout(() => void tick(), RUN_POLL_MS)
    }
    timer = setTimeout(() => void tick(), RUN_POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending, pollEpoch])

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

  const runNow = async () => {
    setConfirmingRun(false)
    setRequesting(true)
    setError(null)
    try {
      setView(await runCleanupNow())
      setStalled(false)
      setPollEpoch((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    } finally {
      setRequesting(false)
    }
  }

  const waiting = pending && !stalled
  const last = view?.last_sweep ? sweepSummary(view.last_sweep, now) : null

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
                  helperText={bad ? `Must be ${f.min} to ${f.max}` : f.key === 'grace_seconds' ? `default ${view.defaults.grace_seconds}` : undefined}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  slotProps={{ htmlInput: { min: f.min, max: f.max, step: 1 } }}
                />
              )
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" disabled={!dirty || !valid || saving} onClick={() => (realDeletes ? setConfirming(true) : void save())}>Save</Button>
            <Button
              variant="outlined" disabled={waiting || requesting}
              onClick={() => (view.policy.dry_run ? void runNow() : setConfirmingRun(true))}
            >Run sweep now</Button>
            {waiting && <Typography variant="body2" color="text.secondary">Sweep requested</Typography>}
            {pending && stalled && <Typography variant="body2" color="warning.main">Still waiting for the reconciler</Typography>}
          </Box>
          <Typography variant="body2" color="text.secondary">{last ? last.line : 'No sweep has run yet'}</Typography>
          {last?.error && <Alert severity="error">{last.error}</Alert>}
        </>
      )}
      <ConfirmDialog
        open={confirming} title="Enable real deletes?" confirmLabel="Enable real deletes"
        body="With dry run off the sweep permanently deletes the archives it selects from S3. Archives a live session references are still kept."
        onConfirm={() => void save()} onCancel={() => setConfirming(false)}
      />
      <ConfirmDialog
        open={confirmingRun} title="Run sweep now?" confirmLabel="Run sweep now"
        body="Dry run is off, so the matching archives are deleted from S3 permanently. Archives a live session references are still kept."
        onConfirm={() => void runNow()} onCancel={() => setConfirmingRun(false)}
      />
    </Paper>
  )
}
