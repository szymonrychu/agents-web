import { ThemeProvider } from '@mui/material/styles'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { theme } from '../theme'
import { SpecsRoute } from './routes'
import type { Spec } from './api'

export function Probe() {
  const l = useLocation()
  return <div data-testid="loc">{`${l.pathname}${l.search}`}</div>
}

export function mountSpecs(path: string) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/specs/*" element={<SpecsRoute />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

export const spec = (over: Partial<Spec> = {}): Spec => ({
  key: 'S-1', project: 'default', name: 'task-plans', title: 'Task plans', status: 'draft', labels: [], assignee_session: null, assignee_slug: null,
  created_by: { kind: 'agent', session: 's1', slug: 'agent-x' }, version: 2, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
})
