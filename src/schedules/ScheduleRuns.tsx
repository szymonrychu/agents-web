/** The last runs of one schedule, newest first: fire time in the schedule's zone, trigger, status and session. */
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect } from 'react'
import { ChainStatusChip, RunStatusChip, usePoll } from '../triggers'
import type { RunStatus } from '../triggers'
import { listScheduleRuns } from './api'
import type { RunView } from './api'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

const LIMIT = 20
const POLL_MS = 10_000

export interface ScheduleRunsProps {
  scheduleId: string
  timezone: string
  /** Changing it reloads the list at once (after a manual run, for example). */
  refreshKey: number
  /** Opens the session in the orchestrator view; without it the slug is plain text. */
  onOpenSession?: (sessionId: string) => void
  /** Opens the runs of the source schedule (found by name: the API gives no source schedule id) at the source run. */
  onOpenSourceRun?: (scheduleName: string, runId: string) => void
  /** A run of this list to scroll to once loaded. */
  focusRunId?: string
}

/** The trigger; a chained run says where it came from and links to the source run when there is one. */
function Trigger({ run, onOpenSourceRun }: { run: RunView; onOpenSourceRun?: ScheduleRunsProps['onOpenSourceRun'] }) {
  if (run.trigger !== 'chained') return <>{run.trigger}</>
  if (run.chain_source === 'webhook') return <>{`chained from webhook ${run.previous_name ?? ''}`.trim()}</>
  const label = `chained from ${run.previous_name ?? 'schedule'}`
  const { chained_from: from, previous_name: name } = run
  if (!from || !name || !onOpenSourceRun) return <>{label}</>
  return <Link component="button" type="button" role="link" onClick={() => onOpenSourceRun(name, from)}>{label}</Link>
}

export function ScheduleRuns({ scheduleId, timezone, refreshKey, onOpenSession, onOpenSourceRun, focusRunId }: ScheduleRunsProps) {
  const { data, error } = usePoll(() => listScheduleRuns(scheduleId, LIMIT), POLL_MS, [scheduleId, refreshKey])
  const loaded = data !== null && data !== undefined
  useEffect(() => {
    if (focusRunId && loaded) document.getElementById(`run-${focusRunId}`)?.scrollIntoView?.({ block: 'center' })
  }, [focusRunId, loaded])
  if (error && !data) return <Typography role="alert" color="error">{error.message}</Typography>
  if (!data) return null
  if (data.length === 0) return <Typography color="text.secondary">No runs yet</Typography>
  const runs = [...data].sort((a, b) => Date.parse(b.fire_time) - Date.parse(a.fire_time))
  const columns: Column<RunView>[] = [
    { key: 'fire', label: 'Fire time', role: 'primary', render: (r) => <DateTime iso={r.fire_time} timeZone={timezone} /> },
    { key: 'status', label: 'Status', role: 'control', render: (r) => <RunStatusChip status={r.status as RunStatus} reason={r.reason ?? undefined} /> },
    { key: 'trigger', label: 'Trigger', role: 'meta', render: (r) => <Trigger run={r} onOpenSourceRun={onOpenSourceRun} /> },
    { key: 'chain', label: 'Chain', role: 'meta', render: (r) => <ChainStatusChip status={r.chain_status} /> },
    {
      key: 'session',
      label: 'Session',
      role: 'meta',
      render: (r) =>
        r.session_id && onOpenSession ? (
          <Link component="button" type="button" role="link" onClick={() => onOpenSession(r.session_id!)}>{r.session_slug ?? r.session_id}</Link>
        ) : (
          (r.session_slug ?? r.session_id)
        ),
    },
  ]
  return <ResponsiveTable rows={runs} columns={columns} rowKey={(r) => r.id} rowId={(r) => `run-${r.id}`} ariaLabel="Runs" cardLabel={(r) => `Run ${r.id}`} />
}
