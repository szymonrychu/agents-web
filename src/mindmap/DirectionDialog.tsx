/** Send a direction to the agents, on a map or on one node, optionally tied to a task and seeding growth areas. */
import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { FormError } from '../triggers'
import { createDirection } from './api'
import type { DirectionView } from './api'

export const TASK_KEY = /^T-[1-9][0-9]*$/

export interface DirectionDialogProps {
  mapKey: string
  /** Set to target one node; leave out for the whole map. */
  nodeKey?: string
  onClose: () => void
  onSaved: (d: DirectionView) => void
}

export function DirectionDialog({ mapKey, nodeKey, onClose, onSaved }: DirectionDialogProps) {
  const [text, setText] = useState('')
  const [areas, setAreas] = useState('')
  const [task, setTask] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const taskKey = task.trim()
  const taskBad = taskKey !== '' && !TASK_KEY.test(taskKey)

  const send = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const growth_areas = areas.split('\n').map((l) => l.trim()).filter((l) => l !== '')
      onSaved(await createDirection(mapKey, { text: text.trim(), ...(nodeKey ? { node: nodeKey } : {}), ...(taskKey ? { task: taskKey } : {}), growth_areas }))
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{nodeKey ? `Direction for ${nodeKey}` : `Direction for ${mapKey}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField label="Direction" multiline minRows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <TextField label="Seed growth areas" multiline minRows={2} value={areas} onChange={(e) => setAreas(e.target.value)} helperText="One per line, optional" />
        <TextField
          label="Task key (optional)"
          value={task}
          error={taskBad}
          onChange={(e) => setTask(e.target.value)}
          helperText={taskBad ? 'A task key looks like T-12' : 'Ties the direction to a task'}
        />
        <FormError error={error instanceof Error ? error : undefined} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || text.trim() === '' || taskBad} onClick={() => void send()}>Send direction</Button>
      </DialogActions>
    </Dialog>
  )
}
