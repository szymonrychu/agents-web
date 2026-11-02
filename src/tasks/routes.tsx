import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Route, Routes, useParams } from 'react-router'

export const taskPath = (key: string): string => `/tasks/${key}`

function TasksList() {
  return <Box data-testid="tasks-list-route" />
}

function TaskDetail() {
  const { key = '' } = useParams()
  return <Box data-testid="task-route" data-key={key} />
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
      <Route index element={<TasksList />} />
      <Route path=":key" element={<TaskDetail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
