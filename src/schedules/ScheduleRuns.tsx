/** The last runs of one schedule, newest first: fire time in the schedule's zone, trigger, status and session. */
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useEffect } from 'react'
import { ChainStatusChip, RunStatusChip, usePoll } from '../triggers'
import type { RunStatus } from '../triggers'
import { listScheduleRuns } from './api'
import type { RunView } from './api'

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

const fireTime = (iso: string, timeZone: string) => new Date(iso).toLocaleString(undefined, { timeZone, dateStyle: 'medium', timeStyle: 'short' })

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
  return (
    <Table size="small" aria-label="Runs">
      <TableHead>
        <TableRow>
          {['Fire time', 'Trigger', 'Status', 'Chain', 'Session'].map((h) => (
            <TableCell key={h}>{h}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.id} id={`run-${r.id}`}>
            <TableCell>{fireTime(r.fire_time, timezone)}</TableCell>
            <TableCell><Trigger run={r} onOpenSourceRun={onOpenSourceRun} /></TableCell>
            <TableCell>
              <RunStatusChip status={r.status as RunStatus} reason={r.reason ?? undefined} />
            </TableCell>
            <TableCell><ChainStatusChip status={r.chain_status} /></TableCell>
            <TableCell>
              {r.session_id && onOpenSession ? (
                <Link component="button" type="button" role="link" onClick={() => onOpenSession(r.session_id!)}>{r.session_slug ?? r.session_id}</Link>
              ) : (
                (r.session_slug ?? r.session_id)
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
