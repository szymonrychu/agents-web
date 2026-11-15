/** Settings > Schedules: every schedule with enable/disable, run now, edit, delete and expandable runs. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { presetInProject } from '../projects/scope'
import { useProject } from '../projects/ProjectContext'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import type { RowAction } from '../layout/RowActions'
import { DateTime } from '../common/DateTime'
import { FormError, ProjectCell, RunStatusChip, usePoll, usePresetIndex } from '../triggers'
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

export function SchedulesPage({ onBack, onOpenSession }: SchedulesPageProps) {
  const { data, error, refresh } = usePoll(listSchedules, POLL_MS, [])
  const presets = usePresetIndex()
  const { project } = useProject()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [runKeys, setRunKeys] = useState<Record<string, number>>({})
  const [focus, setFocus] = useState<{ scheduleId: string; runId: string } | null>(null)
  const [form, setForm] = useState<FormTarget>(null)
  const [deleting, setDeleting] = useState<ScheduleView | null>(null)
  const [actionError, setActionError] = useState<FormErrorValue>(null)

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
  const openSourceRun = (name: string, runId: string) => {
    const source = (data ?? []).find((s) => s.name === name)
    if (!source) return
    setExpanded((e) => new Set(e).add(source.id))
    setFocus({ scheduleId: source.id, runId })
  }
  const saved = () => {
    setForm(null)
    void act(async () => {})
  }

  const actions = (s: ScheduleView): RowAction[] => {
    const open = expanded.has(s.id)
    return [
      { label: open ? 'Hide runs' : 'Show runs', ariaLabel: `${open ? 'Hide' : 'Show'} runs of ${s.name}`, expanded: open, onClick: () => toggleRuns(s.id) },
      { label: 'Run now', onClick: () => void runNow(s) },
      { label: 'Edit', ariaLabel: `Edit ${s.name}`, onClick: () => setForm(s) },
      { label: 'Delete', ariaLabel: `Delete ${s.name}`, color: 'error', onClick: () => setDeleting(s) },
    ]
  }
  const columns: Column<ScheduleView>[] = [
    { key: 'enabled', label: 'Enabled', role: 'control', render: (s) => <Switch size="small" checked={s.enabled} onChange={() => void toggle(s)} slotProps={{ input: { 'aria-label': `Enable ${s.name}` } }} /> },
    { key: 'name', label: 'Name', role: 'primary', render: (s) => s.name },
    { key: 'next', label: 'Next fire', role: 'meta', render: (s) => <DateTime iso={s.enabled ? s.next_fires[0] : null} timeZone={s.timezone} /> },
    { key: 'last', label: 'Last run', role: 'meta', render: (s) => (s.last_run ? <RunStatusChip status={s.last_run.status as RunStatus} reason={s.last_run.reason ?? undefined} /> : '-') },
    { key: 'cron', label: 'Cron', role: 'meta', render: (s) => s.cron, sx: { fontFamily: 'monospace' } },
    { key: 'timezone', label: 'Timezone', role: 'none', render: (s) => s.timezone },
    { key: 'preset', label: 'Preset', role: 'meta', render: (s) => presets[s.preset_id]?.name ?? s.preset_id },
    { key: 'project', label: 'Project', role: 'meta', render: (s) => <ProjectCell presetId={s.preset_id} index={presets} /> },
  ]

  const schedules = (data ?? []).filter((s) => presetInProject(s.preset_id, presets, project))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Schedules" onBack={onBack}>
        <Button variant="contained" onClick={() => setForm('new')}>New schedule</Button>
      </PageHeader>
      <FormError error={error} />
      <FormError error={actionError} />
      {data && schedules.length === 0 ? (
        <Typography color="text.secondary">
          No schedules yet. A schedule starts an agent session from a preset on a cron timetable, sending it a prompt each time it fires.
        </Typography>
      ) : (
        <ResponsiveTable
          rows={schedules}
          columns={columns}
          rowKey={(s) => s.id}
          ariaLabel="Schedules"
          cardLabel={(s) => `Schedule ${s.name}`}
          actions={actions}
          below={(s) =>
            expanded.has(s.id) ? (
              <ScheduleRuns scheduleId={s.id} timezone={s.timezone} refreshKey={runKeys[s.id] ?? 0} onOpenSession={onOpenSession} onOpenSourceRun={openSourceRun} focusRunId={focus?.scheduleId === s.id ? focus.runId : undefined} />
            ) : null
          }
        />
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
