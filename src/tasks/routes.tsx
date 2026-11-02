import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Route, Routes, useParams } from 'react-router'
import { TaskDetail } from './TaskDetail'
import { TasksPage } from './TasksPage'
import { taskPath } from './paths'

export { taskPath }

function TaskRoute() {
  const { key = '' } = useParams()
  return (
    <Box data-testid="task-route" data-key={key} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: 2 }}>
      <TaskDetail taskKey={key} />
    </Box>
  )
}

function NotFound() {
  return (
    <Box data-testid="tasks-not-found">
      <Typography color="text.secondary">Not found</Typography>
    </Box>
  )
}

/** Mounted at `/tasks/*`: the list at the index, one task at `:key`, anything deeper is not found. */
export function TasksRoute() {
  return (
    <Routes>
      <Route index element={<Box data-testid="tasks-list-route" sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}><TasksPage /></Box>} />
      <Route path=":key" element={<TaskRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
