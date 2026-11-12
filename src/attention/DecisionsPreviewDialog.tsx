/** Open decisions one session asked, answered in place; scrolls to the first one and closes itself when none is left. */
import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { Link as RouterLink } from 'react-router'
import type { SessionView } from '../api/client'
import type { Task } from '../tasks/api'
import { DecisionCard } from '../tasks/DecisionCard'
import { taskPath } from '../tasks/paths'
import { openDecisionsOf } from './attention'

export interface DecisionsPreviewDialogProps {
  session: SessionView
  tasks: Task[]
  onClose: () => void
  /** Called after an answer (or a 409), so the caller refetches the waiting tasks. */
  onChanged: () => void
}

export function DecisionsPreviewDialog({ session, tasks, onClose, onChanged }: DecisionsPreviewDialogProps) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))
  const groups = tasks.map((task) => ({ task, open: openDecisionsOf(task, session.id) })).filter((g) => g.open.length > 0)
  const total = groups.reduce((n, g) => n + g.open.length, 0)
  const firstOpenId = groups[0]?.open[0]?.id ?? null

  // Scroll once, after the enter transition and the first open decision are both there; a refresh never scrolls again.
  const [entered, setEntered] = useState(false)
  const firstRef = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!entered || firstOpenId === null || scrolled.current) return
    scrolled.current = true
    firstRef.current?.scrollIntoView?.({ block: 'center' })
  }, [entered, firstOpenId])

  // Close only after an open decision was seen, so a list that loads late does not close the dialog at once.
  const seenOpen = useRef(false)
  useEffect(() => {
    if (total > 0) seenOpen.current = true
    else if (seenOpen.current) onClose()
  }, [total, onClose])

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      fullScreen={fullScreen}
      aria-labelledby="decisions-preview-title"
      slotProps={{ transition: { onEntered: () => setEntered(true) } }}
    >
      <DialogTitle id="decisions-preview-title">{`Decisions waiting in ${session.slug}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.map(({ task, open }) => (
          <Box key={task.key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Link component={RouterLink} to={taskPath(task.key)}>{task.key}</Link>
              <Typography component="span">{task.title}</Typography>
            </Box>
            {open.map((d) => (
              <Box key={d.id} ref={d.id === firstOpenId && task === groups[0].task ? firstRef : undefined}>
                <DecisionCard taskKey={task.key} decision={d} onChanged={onChanged} />
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
