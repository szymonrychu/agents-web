import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { ProjectField } from '../projects/ProjectField'
import { useProject } from '../projects/ProjectContext'
import { LabelEditor } from '../labels/LabelEditor'
import { FormError } from '../triggers'
import { createTask, type Task } from './api'

export interface CreateTaskDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (task: Task) => void
}

/** A user-created idea or task; the client key makes a retried submit idempotent. */
export function CreateTaskDialog({ open, onClose, onCreated }: CreateTaskDialogProps) {
  const { project: selected } = useProject()
  const [project, setProject] = useState(selected ?? 'default')
  const [kind, setKind] = useState<'idea' | 'task'>('task')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [clientKey] = useState(() => crypto.randomUUID())

  const create = async () => {
    setError(null)
    try {
      onCreated(await createTask({ title: title.trim(), body, kind, labels, project, client_key: clientKey }))
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New task</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <FormError error={error} />
        <ToggleButtonGroup exclusive size="small" aria-label="Kind" value={kind} onChange={(_, v: 'idea' | 'task' | null) => v !== null && setKind(v)}>
          <ToggleButton value="task">Task</ToggleButton>
          <ToggleButton value="idea">Idea</ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <TextField size="small" label="Description" multiline minRows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <ProjectField value={project} onChange={setProject} />
        <LabelEditor value={labels} onChange={setLabels} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={title.trim() === ''} onClick={() => void create()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}
