/** Autostart limits and the reorderable start queue of one project. */
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableContainer from '@mui/material/TableContainer'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../api/client'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError, usePoll } from '../triggers'
import { moveQueued, listSpecQueue, putAutostart, removeQueued, STATE_TEXT } from './autostartApi'
import type { ProjectQueue, QueueItem } from './autostartApi'
import { hideOnPhone, TABLE_SCROLL_SX } from '../layout/tables'

const POLL_MS = 10_000
const CHANGED = 'changed meanwhile, reloaded'

const OFF = (project: string): ProjectQueue => ({ project, max_active_sessions: null, max_usage_pct: null, state: 'off', items: [] })
const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))
const show = (n: number | null) => (n === null ? '' : String(n))

/** Empty is unset (null); anything else must be a whole number in range or it is invalid (undefined). */
function parseLimit(text: string, max: number): number | null | undefined {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined
}

export function SpecQueuePanel({ project }: { project: string }) {
  const { data, error, refresh } = usePoll(async () => (await listSpecQueue(project)).find((q) => q.project === project) ?? OFF(project), POLL_MS, [project])
  const now = useNow()
  const [sessions, setSessions] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const [removing, setRemoving] = useState<QueueItem | null>(null)

  const queue = data ?? OFF(project)
  const items = [...queue.items].sort((a, b) => a.position - b.position)
  const sessionsText = sessions ?? show(queue.max_active_sessions)
  const usageText = usage ?? show(queue.max_usage_pct)
  const sessionsValue = parseLimit(sessionsText, 1000)
  const usageValue = parseLimit(usageText, 100)

  /** Run one guarded call; a 409 not_queued means the row left the queue meanwhile. */
  const guarded = async (call: () => Promise<unknown>) => {
    setBusy(true)
    setNotice(null)
    setActionError(null)
    try {
      await call()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'not_queued') setNotice(CHANGED)
      else setActionError(asError(e))
    }
    await refresh().catch(() => {})
    setBusy(false)
  }

  const move = (item: QueueItem, to: { position: number } | { before: number }) => guarded(() => moveQueued(item.id, to))
  const save = () =>
    guarded(async () => {
      await putAutostart(project, { max_active_sessions: sessionsValue ?? null, max_usage_pct: usageValue ?? null })
      setSessions(null)
      setUsage(null)
    })
  const confirmRemove = () => {
    const item = removing
    setRemoving(null)
    if (item) void guarded(() => removeQueued(item.id))
  }
  const dropOn = (target: QueueItem) => {
    const id = dragged
    setDragged(null)
    const item = items.find((i) => i.id === id)
    if (item && item.id !== target.id) void move(item, { before: target.id })
  }
  const dropAtEnd = () => {
    const id = dragged
    setDragged(null)
    const item = items.find((i) => i.id === id)
    if (item) void move(item, { position: items.length })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          type="number"
          label="Max active sessions"
          value={sessionsText}
          error={sessionsValue === undefined}
          helperText="1 to 1000, empty to unset"
          slotProps={{ htmlInput: { min: 1, max: 1000 } }}
          onChange={(e) => setSessions(e.target.value)}
        />
        <TextField
          size="small"
          type="number"
          label="Max usage %"
          value={usageText}
          error={usageValue === undefined}
          helperText="1 to 100, empty to unset"
          slotProps={{ htmlInput: { min: 1, max: 100 } }}
          onChange={(e) => setUsage(e.target.value)}
        />
        <Button variant="contained" disabled={busy || sessionsValue === undefined || usageValue === undefined} onClick={() => void save()}>Save</Button>
        <Typography color="text.secondary" sx={{ alignSelf: 'center' }}>{STATE_TEXT[queue.state]}</Typography>
      </Box>
      <FormError error={error} />
      <FormError error={actionError} />
      {notice && <Alert severity="warning">{notice}</Alert>}
      <TableContainer sx={TABLE_SCROLL_SX}>
      <Table size="small" aria-label="Spec queue">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Spec</TableCell>
            <TableCell>Title</TableCell>
            <TableCell sx={hideOnPhone}>Queued</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, i) => (
            <TableRow
              key={item.id}
              hover
              draggable={!busy}
              onDragStart={() => setDragged(item.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(item)
              }}
              sx={{ cursor: busy ? 'default' : 'grab' }}
            >
              <TableCell>{item.position}</TableCell>
              <TableCell><RouterLink to={`/specs/${encodeURIComponent(item.spec)}`}>{item.spec}</RouterLink></TableCell>
              <TableCell>{item.title}</TableCell>
              <TableCell sx={hideOnPhone}>{`${formatAge(now - Date.parse(item.created_at))} ago`}</TableCell>
              <TableCell align="right">
                <IconButton size="small" aria-label={`Move ${item.spec} up`} disabled={busy || i === 0} onClick={() => void move(item, { position: item.position - 1 })}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
                <IconButton size="small" aria-label={`Move ${item.spec} down`} disabled={busy || i === items.length - 1} onClick={() => void move(item, { position: item.position + 1 })}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
                <Button size="small" color="error" aria-label={`Remove ${item.spec}`} disabled={busy} onClick={() => setRemoving(item)}>Remove</Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Queue is empty</Typography></TableCell></TableRow>
          )}
          {items.length > 0 && dragged !== null && (
            <TableRow onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropAtEnd() }}>
              <TableCell colSpan={5}><Typography color="text.secondary">Drop here to move to the end</Typography></TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </TableContainer>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.spec ?? ''} from the queue?`}
        body="The spec stays approved but will not start automatically."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </Box>
  )
}
