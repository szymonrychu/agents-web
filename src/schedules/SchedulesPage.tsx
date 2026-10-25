/** Settings > Schedules: every schedule with enable/disable, run now, edit, delete and expandable runs. */
import { Fragment, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { listPresets } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError, RunStatusChip, usePoll } from '../triggers'
import type { FormErrorValue, RunStatus } from '../triggers'
import { deleteSchedule, listSchedules, runScheduleNow, updateSchedule } from './api'
import type { ScheduleView } from './api'
import { ScheduleForm } from './ScheduleForm'
import { ScheduleRuns } from './ScheduleRuns'

export interface SchedulesPageProps {
  onBack: () => void
  /** Opens a run's session in the orchestrator view. */
  onOpenSession?: (sessionId: string) => void
}

/** `null` is closed, `'new'` an empty form, a schedule its edit form. */
type FormTarget = ScheduleView | 'new' | null

const POLL_MS = 10_000

const fireTime = (iso: string, timeZone: string) => new Date(iso).toLocaleString(undefined, { timeZone, dateStyle: 'medium', timeStyle: 'short' })

export function SchedulesPage({ onBack, onOpenSession }: SchedulesPageProps) {
  const { data, error, refresh } = usePoll(listSchedules, POLL_MS, [])
  const [presetNames, setPresetNames] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [runKeys, setRunKeys] = useState<Record<string, number>>({})
  const [form, setForm] = useState<FormTarget>(null)
  const [deleting, setDeleting] = useState<ScheduleView | null>(null)
  const [actionError, setActionError] = useState<FormErrorValue>(null)

  useEffect(() => {
    listPresets().then((ps) => setPresetNames(Object.fromEntries(ps.map((p) => [p.id, p.name]))), () => {})
  }, [])

  const act = async (work: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await work()
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e : String(e))
    }
  }
  const toggle = (s: ScheduleView) =>
    act(() => updateSchedule(s.id, { name: s.name, cron: s.cron, timezone: s.timezone, preset_id: s.preset_id, prompt: s.prompt, enabled: !s.enabled }))
  const runNow = (s: ScheduleView) =>
    act(async () => {
      await runScheduleNow(s.id)
      setRunKeys((k) => ({ ...k, [s.id]: (k[s.id] ?? 0) + 1 }))
      setExpanded((e) => new Set(e).add(s.id))
    })
  const remove = () => {
    const target = deleting
    setDeleting(null)
    if (target) void act(() => deleteSchedule(target.id))
  }
  const toggleRuns = (id: string) =>
    setExpanded((e) => {
      const next = new Set(e)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const saved = () => {
    setForm(null)
    void act(async () => {})
  }

  const schedules = data ?? []
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Schedules</Typography>
        <Button variant="contained" onClick={() => setForm('new')}>New schedule</Button>
      </Box>
      <FormError error={error} />
      <FormError error={actionError} />
      {data && schedules.length === 0 ? (
        <Typography color="text.secondary">
          No schedules yet. A schedule starts an agent session from a preset on a cron timetable, sending it a prompt each time it fires.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              {['', 'Enabled', 'Name', 'Cron', 'Timezone', 'Preset', 'Next fire', 'Last run', ''].map((h, i) => <TableCell key={i}>{h}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((s) => (
              <Fragment key={s.id}>
                <TableRow>
                  <TableCell>
                    <Button size="small" aria-expanded={expanded.has(s.id)} aria-label={`${expanded.has(s.id) ? 'Hide' : 'Show'} runs of ${s.name}`} onClick={() => toggleRuns(s.id)}>
                      {expanded.has(s.id) ? '-' : '+'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch size="small" checked={s.enabled} onChange={() => void toggle(s)} slotProps={{ input: { 'aria-label': `Enable ${s.name}` } }} />
                  </TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{s.cron}</TableCell>
                  <TableCell>{s.timezone}</TableCell>
                  <TableCell>{presetNames[s.preset_id] ?? s.preset_id}</TableCell>
                  <TableCell>{s.enabled && s.next_fires[0] ? fireTime(s.next_fires[0], s.timezone) : '-'}</TableCell>
                  <TableCell>
                    {s.last_run ? <RunStatusChip status={s.last_run.status as RunStatus} reason={s.last_run.reason ?? undefined} /> : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => void runNow(s)}>Run now</Button>
                    <Button size="small" aria-label={`Edit ${s.name}`} onClick={() => setForm(s)}>Edit</Button>
                    <Button size="small" color="error" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>Delete</Button>
                  </TableCell>
                </TableRow>
                {expanded.has(s.id) && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <ScheduleRuns scheduleId={s.id} timezone={s.timezone} refreshKey={runKeys[s.id] ?? 0} onOpenSession={onOpenSession} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={form !== null} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form === 'new' || form === null ? 'New schedule' : 'Edit schedule'}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {form !== null && (
            <ScheduleForm schedule={form === 'new' ? undefined : form} onSaved={saved} onCancel={() => setForm(null)} />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null} title="Delete schedule?" confirmLabel="Delete"
        body={deleting ? `${deleting.name} stops firing; its run history is removed.` : undefined}
        onConfirm={remove} onCancel={() => setDeleting(null)}
      />
    </Box>
  )
}
