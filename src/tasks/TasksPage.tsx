import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router'
import { LabelChips } from '../labels/LabelChips'
import { useProject } from '../projects/ProjectContext'
import { LabelEditor } from '../labels/LabelEditor'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
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
  const spec = params.get('spec') ?? ''
  const labels = params.getAll('label')
  const { project } = useProject()

  const { data, error, loading, refresh } = usePoll(() => listTasks({ status, session: session || undefined, spec: spec || undefined, project, labels }), POLL_MS, [status, session, spec, project, labels.join('\n')])
  useTaskStream(() => void refresh())

  // Further pages are appended to the first one; a poll or a filter change starts over.
  const [extra, setExtra] = useState<{ page: TaskPage | undefined; items: Task[]; next: string | null } | null>(null)
  const more = extra !== null && extra.page === data ? extra : null
  const items = [...(data?.items ?? []), ...(more?.items ?? [])]
  const next = more ? more.next : (data?.next_cursor ?? null)
  const loadMore = async () => {
    if (next === null) return
    const page = await listTasks({ status, session: session || undefined, spec: spec || undefined, project, labels, cursor: next })
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

  const columns: Column<Task>[] = [
    { key: 'key', label: 'Key', role: 'primary', render: (t) => <Link component={RouterLink} to={taskPath(t.key)} sx={{ whiteSpace: 'nowrap' }}>{t.key}</Link> },
    {
      key: 'title',
      label: 'Title',
      role: 'primary',
      render: (t) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <span>{t.title}</span>
          {t.open_decisions > 0 && <Chip size="small" color="warning" label={`Blocked (${t.open_decisions})`} />}
        </Box>
      ),
    },
    { key: 'status', label: 'Status', role: 'meta', render: (t) => <Chip size="small" label={t.status.replace('_', ' ')} /> },
    { key: 'labels', label: 'Labels', role: 'meta', render: (t) => (t.labels.length > 0 ? <LabelChips labels={t.labels} onClick={addLabel} /> : '-') },
    { key: 'project', label: 'Project', role: 'meta', render: (t) => (t.project ? <Chip size="small" variant="outlined" label={t.project} /> : '-') },
    {
      key: 'assignee',
      label: 'Assignee',
      role: 'meta',
      render: (t) => (t.assignee_session ? <Link component={RouterLink} to={`/tasks?session=${encodeURIComponent(t.assignee_session)}`}>{t.assignee_session}</Link> : '-'),
    },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto', p: 2 }}>
      <PageHeader title="Tasks" onBack={() => navigate('/')}>
        <Button variant="contained" onClick={() => setCreating(true)}>New</Button>
      </PageHeader>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          sx={{ flexWrap: 'wrap' }}
          aria-label="Status"
          value={status}
          onChange={(_, v: ListStatus | null) => v !== null && update((p) => (v === 'active' ? p.delete('status') : p.set('status', v)))}
        >
          {STATUSES.map((s) => (
            <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField size="small" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 160 } }} label="Session" value={session} onChange={(e) => update((p) => (e.target.value === '' ? p.delete('session') : p.set('session', e.target.value)))} />
        <TextField size="small" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 160 } }} label="Spec" placeholder="S-1" value={spec} onChange={(e) => update((p) => (e.target.value === '' ? p.delete('spec') : p.set('spec', e.target.value)))} />
        <Box sx={{ minWidth: 240, flexGrow: 1 }}>
          <LabelEditor value={labels} onChange={setLabels} />
        </Box>
      </Box>
      <FormError error={error} />
      <ResponsiveTable rows={items} columns={columns} rowKey={(t) => t.key} ariaLabel="Tasks" cardLabel={(t) => `Task ${t.key}`} />
      {!loading && items.length === 0 && !error && <Typography color="text.secondary">No tasks</Typography>}
      {next !== null && <Box><Button onClick={() => void loadMore()}>Load more</Button></Box>}
      {creating && <CreateTaskDialog open onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); navigate(taskPath(t.key)) }} />}
    </Box>
  )
}
