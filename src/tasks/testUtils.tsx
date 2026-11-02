import { ThemeProvider } from '@mui/material/styles'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { theme } from '../theme'
import { TasksRoute } from './routes'
import type { Decision, Task } from './api'

export function Probe() {
  const l = useLocation()
  return <div data-testid="loc">{`${l.pathname}${l.search}`}</div>
}

export function mountTasks(path: string) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tasks/*" element={<TasksRoute />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

export const decision = (over: Partial<Decision> = {}): Decision => ({
  id: 5, asking_session: 's1', asking_slug: 'agent-x', question: 'Which db?', context: '', status: 'open', answer: null, note: null,
  created_at: '2026-11-01T10:00:00Z', answered_at: null,
  options: [{ label: 'Postgres', recommended: true, description: 'boring' }, { label: 'SQLite' }], ...over,
})

export const task = (over: Partial<Task> = {}): Task => ({
  key: 'T-1', title: 'First task', body: 'Do it', kind: 'task', status: 'open', labels: [], assignee_session: null, blocked: false,
  open_decisions: 0, waiting_sessions: [], todo: [], decisions: [], comments: [], events: [], url: 'https://x/T-1', version: 3,
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
})
