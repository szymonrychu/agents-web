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
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
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
  const { data, error, refresh } = usePoll(() => listProjects(showArchived), POLL_MS, [showArchived])
  const board = usePoll(() => projectsSummary().catch((): ProjectSummary[] => []), POLL_MS, [])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [archiving, setArchiving] = useState<Project | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  const summaryOf = (slug: string) => board.data?.find((s) => s.project === slug)
  const count = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n)

  const setArchived = async (p: Project, archived: boolean) => {
    setActionError(null)
    try {
      await patchProject(p.slug, { archived })
    } catch (e) {
      setActionError(e instanceof Error ? e : new Error(String(e)))
    }
    await refresh().catch(() => {})
  }
  const confirmArchive = () => {
    const p = archiving
    setArchiving(null)
    if (p) void setArchived(p, true)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Projects</Typography>
        <FormControlLabel control={<Switch checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />} label="Archived only" />
        <Button variant="contained" onClick={() => setEditing({ mode: 'create' })}>New project</Button>
      </Box>
      <FormError error={actionError} />
      <FormError error={error} />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Project</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Presets</TableCell>
            <TableCell align="right">Sessions</TableCell>
            <TableCell align="right">Open tasks</TableCell>
            <TableCell align="right">Waiting decisions</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {(data ?? []).map((p) => {
            const s = summaryOf(p.slug)
            return (
              <TableRow key={p.slug}>
                <TableCell>
                  {p.name} <Typography component="span" color="text.secondary">({p.slug})</Typography>
                  {p.archived && <Chip size="small" label="Archived" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{p.description}</TableCell>
                <TableCell align="right">{count(p.presets)}</TableCell>
                <TableCell align="right">{count(p.sessions)}</TableCell>
                <TableCell align="right">{count(s?.open_tasks)}</TableCell>
                <TableCell align="right">{count(s?.waiting_decisions)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setEditing({ mode: 'edit', project: p })}>Edit</Button>
                  {p.archived ? (
                    <Button size="small" onClick={() => void setArchived(p, false)}>Restore</Button>
                  ) : (
                    <Button size="small" color="error" disabled={p.slug === 'default'} onClick={() => setArchiving(p)}>Archive</Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {editing && (
        <ProjectDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh().catch(() => {})
          }}
        />
      )}
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
