/** Projects: list with preset, session, task and decision counts; create, edit and archive. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { isConfigured } from '../config/backends'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import type { RowAction } from '../layout/RowActions'
import { FormError, usePoll } from '../triggers'
import { useProject } from './ProjectContext'
import { ProjectRoom } from './ProjectRoom'
import { listSpecQueue } from './autostartApi'
import type { ProjectQueue } from './autostartApi'
import { SpecQueuePanel } from './SpecQueuePanel'
import { createProject, listProjects, patchProject, projectsSummary } from './api'
import type { Project, ProjectSummary } from './api'


const POLL_MS = 15_000
const NAME_MAX = 80
const DESCRIPTION_MAX = 4000
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

type Editing = { mode: 'create' } | { mode: 'edit'; project: Project }

function ProjectDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const project = editing.mode === 'edit' ? editing.project : null
  const [slug, setSlug] = useState(project?.slug ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const slugBad = project === null && slug !== '' && !SLUG_PATTERN.test(slug)
  const nameBad = name.length > NAME_MAX
  const descriptionBad = description.length > DESCRIPTION_MAX
  const valid = name.trim() !== '' && !nameBad && !descriptionBad && (project !== null || SLUG_PATTERN.test(slug))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (project) await patchProject(project.slug, { name: name.trim(), description })
      else await createProject({ slug, name: name.trim(), description })
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setBusy(false)
      return
    }
    onSaved()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{project ? `Edit ${project.slug}` : 'New project'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          size="small"
          label="Slug"
          value={slug}
          disabled={project !== null}
          error={slugBad}
          helperText={slugBad ? 'Use 1 to 40 lowercase letters, digits and dashes, starting with a letter or digit.' : 'Cannot be changed later.'}
          onChange={(e) => setSlug(e.target.value)}
        />
        <TextField size="small" label="Name" value={name} error={nameBad} helperText={`1 to ${NAME_MAX} characters.`} onChange={(e) => setName(e.target.value)} />
        <TextField size="small" label="Description" value={description} error={descriptionBad} helperText={`Up to ${DESCRIPTION_MAX} characters.`} multiline minRows={2} onChange={(e) => setDescription(e.target.value)} />
        <FormError error={error} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || busy} onClick={() => void save()}>{project ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  )
}

export function ProjectsPage({ onBack }: { onBack: () => void }) {
  const [showArchived, setShowArchived] = useState(false)
  const { refreshProjects } = useProject()
  const { data, error, refresh } = usePoll(() => listProjects(showArchived), POLL_MS, [showArchived])
  const board = usePoll(() => projectsSummary().catch((): ProjectSummary[] => []), POLL_MS, [])
  const queues = usePoll(() => listSpecQueue().catch((): ProjectQueue[] => []), POLL_MS, [])
  const [expanded, setExpanded] = useState<string | null>(null)
  const autostart = isConfigured('taskboard')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [archiving, setArchiving] = useState<Project | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  const summaryOf = (slug: string) => board.data?.find((s) => s.project === slug)
  const queuedOf = (slug: string) => queues.data?.find((q) => q.project === slug)?.items.length ?? 0
  const count = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n)

  const setArchived = async (p: Project, archived: boolean) => {
    setActionError(null)
    try {
      await patchProject(p.slug, { archived })
    } catch (e) {
      setActionError(e instanceof Error ? e : new Error(String(e)))
    }
    refreshProjects()
    await refresh().catch(() => {})
  }
  const confirmArchive = () => {
    const p = archiving
    setArchiving(null)
    if (p) void setArchived(p, true)
  }

  const actions = (p: Project): RowAction[] => [
    ...(autostart ? [{ label: 'Autostart', expanded: expanded === p.slug, onClick: () => setExpanded(expanded === p.slug ? null : p.slug) }] : []),
    { label: 'Room', onClick: () => setRoom(p.slug) },
    { label: 'Edit', onClick: () => setEditing({ mode: 'edit', project: p }) },
    p.archived
      ? { label: 'Restore', onClick: () => void setArchived(p, false) }
      : { label: 'Archive', color: 'error' as const, disabled: p.slug === 'default', onClick: () => setArchiving(p) },
  ]
  const columns: Column<Project>[] = [
    {
      key: 'project', label: 'Project', role: 'primary',
      render: (p) => {
        const queued = queuedOf(p.slug)
        return (
          <>
            {p.name} <Typography component="span" color="text.secondary">({p.slug})</Typography>
            {p.archived && <Chip size="small" label="Archived" sx={{ ml: 1 }} />}
            {queued > 0 && <Chip size="small" color="info" label={`${queued} queued`} sx={{ ml: 1 }} />}
          </>
        )
      },
    },
    { key: 'description', label: 'Description', role: 'secondary', render: (p) => p.description },
    { key: 'presets', label: 'Presets', role: 'meta', align: 'right', render: (p) => count(p.presets) },
    { key: 'sessions', label: 'Sessions', role: 'meta', align: 'right', render: (p) => count(p.sessions) },
    { key: 'open', label: 'Open tasks', role: 'meta', align: 'right', render: (p) => count(summaryOf(p.slug)?.open_tasks) },
    { key: 'waiting', label: 'Waiting decisions', role: 'meta', align: 'right', render: (p) => count(summaryOf(p.slug)?.waiting_decisions) },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Projects" onBack={onBack}>
        <FormControlLabel control={<Switch checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />} label="Archived only" />
        <Button variant="contained" onClick={() => setEditing({ mode: 'create' })}>New project</Button>
      </PageHeader>
      <FormError error={actionError} />
      <FormError error={error} />
      <ResponsiveTable
        rows={data ?? []}
        columns={columns}
        rowKey={(p) => p.slug}
        ariaLabel="Projects"
        cardLabel={(p) => `Project ${p.name}`}
        actions={actions}
        below={(p) => (autostart && expanded === p.slug ? <SpecQueuePanel project={p.slug} /> : null)}
      />
      {editing && (
        <ProjectDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refreshProjects()
            void refresh().catch(() => {})
          }}
        />
      )}
      {room && <ProjectRoom slug={room} onClose={() => setRoom(null)} />}
      <ConfirmDialog
        open={archiving !== null}
        title={`Archive ${archiving?.slug ?? ''}?`}
        body="Archived projects are hidden from the list and refuse new presets, sessions and tasks. Existing ones stay. You can restore it later."
        confirmLabel="Archive"
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </Box>
  )
}
