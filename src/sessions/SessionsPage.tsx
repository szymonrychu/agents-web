/** Settings > Sessions: every session with its state and autoclose time left; open, new and discard; an empty state when there is none. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { listSessions } from '../api/client'
import type { SessionView } from '../api/client'
import { useProject } from '../projects/ProjectContext'
import { LabelChips } from '../labels/LabelChips'
import { LabelEditor } from '../labels/LabelEditor'
import { sessionIssue, sessionMarkState } from '../ribbon/sessionStatus'
import { markLabel } from '../ribbon/stateMark'
import { DateTime } from '../common/DateTime'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { DiscardSessionDialog } from './DiscardSessionDialog'
import { MoveProjectDialog } from './MoveProjectDialog'
import { NewSessionDialog } from './NewSessionDialog'

export interface SessionsPageProps {
  onBack: () => void
  /** Selects the session and returns to its workspace. */
  onOpen: (sessionId: string) => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Autoclose time left: "never" without a deadline, "closing" once it has passed. */
export function timeLeft(closesAt: string | null, now = Date.now()): string {
  if (closesAt === null) return 'never'
  const minutes = Math.floor((new Date(closesAt).getTime() - now) / 60_000)
  if (minutes < 1) return 'closing'
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return `${d > 0 ? `${d}d ` : ''}${d > 0 || h > 0 ? `${h}h ` : ''}${m}m left`
}

const COLUMNS: Column<SessionView>[] = [
  { key: 'slug', label: 'Session', role: 'primary', render: (c) => c.slug },
  { key: 'preset', label: 'Preset', role: 'meta', render: (c) => c.preset_name ?? 'none' },
  { key: 'project', label: 'Project', role: 'meta', render: (c) => <Chip size="small" variant="outlined" label={c.project} /> },
  {
    key: 'state',
    label: 'State',
    role: 'meta',
    render: (c) => {
      const issue = sessionIssue(c, [])?.text
      return (
        <>
          {markLabel(sessionMarkState(c, []))}
          {issue ? <Typography component="span" color="error" sx={{ ml: 1 }}>{issue}</Typography> : null}
        </>
      )
    },
  },
  { key: 'ready', label: 'Ready', role: 'meta', render: (c) => `${c.summary.ready}/${c.summary.replicas}` },
  { key: 'created', label: 'Created', role: 'meta', render: (c) => <DateTime iso={c.created_at} /> },
  { key: 'closes', label: 'Closes', role: 'meta', render: (c) => timeLeft(c.closes_at) },
  { key: 'labels', label: 'Labels', role: 'meta', render: (c) => ((c.labels ?? []).length > 0 ? <LabelChips labels={c.labels ?? []} /> : '-') },
]

export function SessionsPage({ onBack, onOpen }: SessionsPageProps) {
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [creating, setCreating] = useState(false)
  const { project } = useProject()
  const [moving, setMoving] = useState<SessionView | null>(null)
  const [discarding, setDiscarding] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Server-side filter: sessions carrying any of these labels.
  const [filter, setFilter] = useState<string[]>([])

  // Bumped after every create or discard; the effect below refetches the list.
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    listSessions(filter, project)
      .then((list) => {
        if (cancelled) return
        setSessions([...list].sort((a, b) => a.slug.localeCompare(b.slug)))
        setError(null)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(message(e))
      })
    return () => {
      cancelled = true
    }
  }, [version, filter, project])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Sessions" onBack={onBack}>
        <Button variant="outlined" onClick={() => setCreating(true)}>New session</Button>
      </PageHeader>
      <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
        <LabelEditor label="Filter by label" value={filter} onChange={setFilter} />
      </Box>
      {error && <Alert severity="error" variant="outlined">{error}</Alert>}
      {loaded && !error && sessions.length === 0 && <Typography color="text.secondary">No sessions yet</Typography>}
      <ResponsiveTable
        rows={sessions}
        columns={COLUMNS}
        rowKey={(c) => c.id}
        ariaLabel="Sessions"
        cardLabel={(c) => `Session ${c.slug}`}
        actions={(c) => [
          { label: 'Open', ariaLabel: `Open ${c.slug}`, onClick: () => onOpen(c.id) },
          { label: 'Move to project', ariaLabel: `Move ${c.slug} to project`, onClick: () => setMoving(c) },
          { label: 'Discard', ariaLabel: `Discard ${c.slug}`, color: 'error', onClick: () => setDiscarding(c) },
        ]}
      />
      <NewSessionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          reload()
        }}
      />
      {moving && (
        <MoveProjectDialog
          open
          session={moving}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null)
            reload()
          }}
        />
      )}
      {discarding && (
        <DiscardSessionDialog
          open
          session={discarding}
          onClose={() => setDiscarding(null)}
          onDiscarded={() => {
            setDiscarding(null)
            reload()
          }}
        />
      )}
    </Box>
  )
}
