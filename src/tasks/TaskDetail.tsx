import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../api/client'
import { LabelEditor } from '../labels/LabelEditor'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { addComment, getTask, patchTask, type Task, type TaskPatch } from './api'
import { DecisionCard } from './DecisionCard'
import { TodoList } from './TodoList'
import { useTaskStream } from './useTaskStream'

const POLL_MS = 10000

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md, fontWeight: 500 }}>{title}</Typography>
      {children}
    </Box>
  )
}

function Description({ task, save }: { task: Task; save: (patch: Omit<TaskPatch, 'version'>) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{task.body === '' ? 'No description' : task.body}</Typography>
        <Box><Button size="small" onClick={() => setDraft(task.body)}>Edit description</Button></Box>
      </>
    )
  }
  return (
    <>
      <TextField multiline minRows={3} label="Description" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" onClick={() => void save({ body: draft }).then(() => setDraft(null), () => {})}>Save</Button>
        <Button onClick={() => setDraft(null)}>Cancel</Button>
      </Box>
    </>
  )
}

function Comments({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const post = async () => {
    setError(null)
    try {
      await addComment(task.key, text.trim())
      setText('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }
  return (
    <>
      {task.comments.length === 0 && <Typography color="text.secondary">No comments</Typography>}
      <List dense disablePadding>
        {task.comments.map((c) => (
          <ListItem key={c.id} disableGutters>
            <ListItemText primary={c.body} secondary={`${c.author_slug ?? c.author_kind} - ${new Date(c.created_at).toLocaleString()}`} slotProps={{ primary: { sx: { whiteSpace: 'pre-wrap' } } }} />
          </ListItem>
        ))}
      </List>
      <FormError error={error} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField size="small" label="Add a comment" value={text} onChange={(e) => setText(e.target.value)} sx={{ flexGrow: 1 }} />
        <Button disabled={text.trim() === ''} onClick={() => void post()}>Comment</Button>
      </Box>
    </>
  )
}

function NotFound({ taskKey }: { taskKey: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
      <Typography>{`Task ${taskKey} not found`}</Typography>
      <Button component={RouterLink} to="/tasks">Back to tasks</Button>
    </Box>
  )
}

export function TaskDetail({ taskKey }: { taskKey: string }) {
  const { data: task, error, refresh } = usePoll(() => getTask(taskKey), POLL_MS, [taskKey])
  const [actionError, setActionError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  useTaskStream((key) => {
    if (key === taskKey) void refresh()
  })

  if (error instanceof ApiError && error.status === 404) return <NotFound taskKey={taskKey} />
  if (!task) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>

  const save = async (patch: Omit<TaskPatch, 'version'>) => {
    setActionError(null)
    setStale(false)
    try {
      await patchTask(task.key, { version: task.version, ...patch })
      void refresh()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale_version') {
        setStale(true)
        void refresh()
      } else setActionError(e instanceof Error ? e : new Error(String(e)))
      throw e
    }
  }
  const saveQuiet = (patch: Omit<TaskPatch, 'version'>) => save(patch).catch(() => {})

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/tasks">All tasks</Button>
        <Typography color="text.secondary">{task.key}</Typography>
        <Typography component="h1" sx={{ fontSize: TOKENS.fontSizes.lg }}>{task.title}</Typography>
        <Chip size="small" label={task.status.replace('_', ' ')} />
        {task.open_decisions > 0 && <Chip size="small" color="warning" label={`Blocked (${task.open_decisions})`} />}
      </Box>
      <FormError error={error} />
      <FormError error={actionError} />
      {stale && <Alert severity="warning">The task changed since you opened it; it was reloaded, try again.</Alert>}
      <LabelEditor value={task.labels} onChange={(labels) => void saveQuiet({ labels })} />
      <Section title="Description"><Description task={task} save={save} /></Section>
      <Section title="Decisions">
        {task.decisions.length === 0 && <Typography color="text.secondary">No decisions</Typography>}
        {task.decisions.map((d) => (
          <DecisionCard key={d.id} taskKey={task.key} decision={d} onChanged={() => void refresh()} />
        ))}
      </Section>
      <Section title="Todo"><TodoList task={task} onChanged={() => void refresh()} /></Section>
      <Section title="Comments"><Comments task={task} onChanged={() => void refresh()} /></Section>
      <Section title="Waiting sessions">
        {task.waiting_sessions.length === 0 && <Typography color="text.secondary">No session is waiting</Typography>}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {task.waiting_sessions.map((w) => (
            <Link key={w.session_id} component={RouterLink} to={`/?session=${encodeURIComponent(w.session_id)}`}>{w.slug ?? w.session_id}</Link>
          ))}
        </Box>
      </Section>
      <Section title="History">
        <List dense disablePadding>
          {task.events.map((ev) => (
            <ListItem key={ev.id} disableGutters>
              <ListItemText primary={`${ev.actor_slug ?? ev.actor_kind}: ${ev.kind}`} secondary={new Date(ev.at).toLocaleString()} />
            </ListItem>
          ))}
        </List>
      </Section>
    </Box>
  )
}
