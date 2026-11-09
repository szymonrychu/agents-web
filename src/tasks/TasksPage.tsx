import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'
import { LabelChips } from '../labels/LabelChips'
import { useProject } from '../projects/ProjectContext'
import { LabelEditor } from '../labels/LabelEditor'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { listTasks, type ListStatus, type Task, type TaskPage } from './api'
import { CreateTaskDialog } from './CreateTaskDialog'
import { taskPath } from './paths'
import { useTaskStream } from './useTaskStream'

const POLL_MS = 10000
const STATUSES: { value: ListStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'all', label: 'All' },
]

function asStatus(raw: string | null): ListStatus {
  return STATUSES.some((s) => s.value === raw) ? (raw as ListStatus) : 'active'
}

export function TasksPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const status = asStatus(params.get('status'))
  const session = params.get('session') ?? ''
  const labels = params.getAll('label')
  const { project } = useProject()

  const { data, error, loading, refresh } = usePoll(() => listTasks({ status, session: session || undefined, project, labels }), POLL_MS, [status, session, project, labels.join('\n')])
  useTaskStream(() => void refresh())

  // Further pages are appended to the first one; a poll or a filter change starts over.
  const [extra, setExtra] = useState<{ page: TaskPage | undefined; items: Task[]; next: string | null } | null>(null)
  const more = extra !== null && extra.page === data ? extra : null
  const items = [...(data?.items ?? []), ...(more?.items ?? [])]
  const next = more ? more.next : (data?.next_cursor ?? null)
  const loadMore = async () => {
    if (next === null) return
    const page = await listTasks({ status, session: session || undefined, project, labels, cursor: next })
    setExtra({ page: data, items: [...(more?.items ?? []), ...page.items], next: page.next_cursor })
  }

  const update = (edit: (p: URLSearchParams) => void) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      edit(p)
      return p
    }, { replace: true })
  const setLabels = (next: string[]) =>
    update((p) => {
      p.delete('label')
      for (const l of next) p.append('label', l)
    })
  const addLabel = (label: string) => {
    if (!labels.includes(label)) setLabels([...labels, label])
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button component={RouterLink} to="/">Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Tasks</Typography>
        <Button variant="contained" onClick={() => setCreating(true)}>New</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          aria-label="Status"
          value={status}
          onChange={(_, v: ListStatus | null) => v !== null && update((p) => (v === 'active' ? p.delete('status') : p.set('status', v)))}
        >
          {STATUSES.map((s) => (
            <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField size="small" label="Session" value={session} onChange={(e) => update((p) => (e.target.value === '' ? p.delete('session') : p.set('session', e.target.value)))} />
        <Box sx={{ minWidth: 240, flexGrow: 1 }}>
          <LabelEditor value={labels} onChange={setLabels} />
        </Box>
      </Box>
      <FormError error={error} />
      <Table size="small" aria-label="Tasks">
        <TableHead>
          <TableRow>
            <TableCell>Key</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Project</TableCell>
            <TableCell>Labels</TableCell>
            <TableCell>Assignee</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((t) => (
            <TableRow key={t.key} hover>
              <TableCell><Link component={RouterLink} to={taskPath(t.key)}>{t.key}</Link></TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <span>{t.title}</span>
                  {t.open_decisions > 0 && <Chip size="small" color="warning" label={`Blocked (${t.open_decisions})`} />}
                </Box>
              </TableCell>
              <TableCell><Chip size="small" label={t.status.replace('_', ' ')} /></TableCell>
              <TableCell><Chip size="small" variant="outlined" label={t.project} /></TableCell>
              <TableCell><LabelChips labels={t.labels} onClick={addLabel} /></TableCell>
              <TableCell>
                {t.assignee_session && <Link component={RouterLink} to={`/tasks?session=${encodeURIComponent(t.assignee_session)}`}>{t.assignee_session}</Link>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!loading && items.length === 0 && !error && <Typography color="text.secondary">No tasks</Typography>}
      {next !== null && <Box><Button onClick={() => void loadMore()}>Load more</Button></Box>}
      {creating && <CreateTaskDialog open onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); navigate(taskPath(t.key)) }} />}
    </Box>
  )
}
