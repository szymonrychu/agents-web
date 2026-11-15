import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../api/client'
import { LabelChips } from '../labels/LabelChips'
import { TOKENS } from '../theme'
import { getTask, type Task } from '../tasks/api'
import { taskPath } from '../tasks/paths'
import { FormError, usePoll } from '../triggers'
import { createComment, getSpec, patchSpec, type Spec, type SpecDocument, type SpecStatus } from './api'
import { GatePanel } from './GatePanel'
import { docPath } from './paths'
import { PlanTab } from './PlanTab'
import { StartState } from './StartState'
import { useSpecStream } from './useSpecStream'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'


const POLL_MS = 10000

interface Bundle {
  spec: Spec
  tasks: Task[]
}

async function loadBundle(key: string): Promise<Bundle> {
  const spec = await getSpec(key)
  // A linked task that cannot be read (moved, deleted meanwhile) is left out rather than failing the page.
  const tasks = await Promise.all((spec.tasks ?? []).map((t) => getTask(t).catch(() => null)))
  return { spec, tasks: tasks.filter((t): t is Task => t !== null) }
}

const documentColumns = (specKey: string): Column<SpecDocument>[] => [
  { key: 'path', label: 'Path', role: 'primary', render: (d) => <Link component={RouterLink} to={docPath(specKey, d.path)}>{d.path}</Link> },
  { key: 'version', label: 'Version', role: 'meta', render: (d) => `v${d.version}` },
  { key: 'size', label: 'Size', role: 'meta', render: (d) => `${d.size} B` },
  { key: 'updated', label: 'Updated', role: 'meta', render: (d) => <DateTime iso={d.updated_at} /> },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md, fontWeight: 500 }}>{title}</Typography>
      {children}
    </Box>
  )
}

function Gone({ text }: { text: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
      <Typography>{text}</Typography>
      <Button component={RouterLink} to="/specs">Back to specs</Button>
    </Box>
  )
}

export function SpecPage({ specKey }: { specKey: string }) {
  const { data, error, refresh } = usePoll(() => loadBundle(specKey), POLL_MS, [specKey])
  const [deleted, setDeleted] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  const [changes, setChanges] = useState<string | null>(null)
  const [tab, setTab] = useState<'documents' | 'plan' | 'gate'>('documents')
  // Set once the change-request comment is stored, so a retry after a failed PATCH does not post it again.
  const commented = useRef(false)
  useSpecStream((ev) => {
    if (ev.type === 'reset') void refresh()
    else if (ev.key === specKey) {
      if (ev.deleted) setDeleted(true)
      else void refresh()
    }
  })

  if (deleted) return <Gone text="This spec was deleted" />
  if (error instanceof ApiError && error.status === 404) return <Gone text={`Spec ${specKey} not found`} />
  if (!data) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>
  const { spec, tasks } = data

  const setStatus = async (status: SpecStatus, comment?: string) => {
    setActionError(null)
    setStale(false)
    try {
      if (comment !== undefined && !commented.current) {
        await createComment(spec.key, { body: comment })
        commented.current = true
      }
      await patchSpec(spec.key, { version: spec.version, status })
      commented.current = false
      setChanges(null)
      void refresh()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale_version') {
        setStale(true)
        void refresh()
      } else setActionError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/specs">All specs</Button>
        <Typography color="text.secondary">{spec.key}</Typography>
        <Typography component="h1" sx={{ fontSize: TOKENS.fontSizes.lg }}>{spec.title}</Typography>
        <Chip size="small" label={spec.status} />
        <Chip size="small" variant="outlined" label={spec.project} />
        {(spec.open_comments ?? 0) > 0 && <Chip size="small" color="warning" label={`${spec.open_comments} open comments`} />}
      </Box>
      <LabelChips labels={spec.labels} />
      <StartState starts={spec.starts} />
      <FormError error={error} />
      <FormError error={actionError} />
      {stale && <Alert severity="warning">The spec changed since you opened it; it was reloaded, try again.</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {(spec.status === 'draft' || spec.status === 'review') && <Button variant="contained" onClick={() => void setStatus('approved')}>Approve</Button>}
        {(spec.status === 'review' || spec.status === 'approved') && changes === null && <Button onClick={() => setChanges('')}>Request changes</Button>}
        {spec.status !== 'archived' && <Button onClick={() => void setStatus('archived')}>Archive</Button>}
      </Box>
      {changes !== null && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" multiline label="What should change" value={changes} onChange={(e) => { commented.current = false; setChanges(e.target.value) }} sx={{ flexGrow: 1 }} />
          <Button variant="contained" disabled={changes.trim() === ''} onClick={() => void setStatus('draft', changes.trim())}>Send</Button>
          <Button onClick={() => { commented.current = false; setChanges(null) }}>Cancel</Button>
        </Box>
      )}
      <Tabs value={tab} onChange={(_, v: 'documents' | 'plan' | 'gate') => setTab(v)} aria-label="Spec sections">
        <Tab value="documents" label="Documents" />
        <Tab value="plan" label="Plan" />
        <Tab value="gate" label="Gate" />
      </Tabs>
      {tab === 'plan' && <PlanTab specKey={spec.key} />}
      {tab === 'gate' && <GatePanel specKey={spec.key} onApprove={() => void setStatus('approved')} />}
      {tab === 'documents' && (
        <>
        <Section title="Documents">
          <ResponsiveTable
            rows={spec.documents ?? []}
            columns={documentColumns(spec.key)}
            rowKey={(d) => d.path}
            ariaLabel="Documents"
            cardLabel={(d) => `Document ${d.path}`}
            empty={<Typography color="text.secondary">No documents</Typography>}
          />
        </Section>
        <Section title="Tasks">
          {tasks.length === 0 && <Typography color="text.secondary">No linked tasks</Typography>}
          {tasks.map((t) => (
            <Box key={t.key} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link component={RouterLink} to={taskPath(t.key)}>{t.key}</Link>
              <span>{t.title}</span>
              <Chip size="small" label={t.status.replace('_', ' ')} />
              {t.open_decisions > 0 && <Chip size="small" color="warning" label={`Blocked (${t.open_decisions})`} />}
            </Box>
          ))}
        </Section>
        </>
      )}
    </Box>
  )
}
