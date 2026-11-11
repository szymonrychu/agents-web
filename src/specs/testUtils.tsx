import { ThemeProvider } from '@mui/material/styles'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { theme } from '../theme'
import { SpecsRoute } from './routes'
import type { DocBody, DocVersion, Spec, SpecComment, SpecDocument } from './api'

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
  created_by: { kind: 'agent', session: 's1', slug: 'agent-x' }, version: 2, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
  url: '/specs/S-1', documents: [], tasks: [], open_comments: 0, ...over,
})

export const specDoc = (over: Partial<SpecDocument> = {}): SpecDocument => ({
  path: 'plan.md', version: 2, sha256: 'abc', size: 120, created_by: { kind: 'agent', session: 's1', slug: 'agent-x' }, updated_at: '2026-11-02T10:00:00Z', ...over,
})

export const docVersion = (over: Partial<DocVersion> = {}): DocVersion => ({
  path: 'plan.md', version: 2, sha256: 'abc', size: 120, note: null, sources: [], created_by: { kind: 'agent', session: 's1', slug: 'agent-x' },
  created_by_kind: 'agent', created_by_session: 's1', created_by_slug: 'agent-x',
  created_at: '2026-11-02T10:00:00Z', removed: false, ...over,
})

export const docBody = (over: Partial<DocBody> = {}): DocBody => ({ ...docVersion(), body: '# Intro\n\nHello', ...over })

export const comment = (over: Partial<SpecComment> = {}): SpecComment => ({
  id: 7, path: 'plan.md', version: 2, anchor: null, body: 'Looks odd', suggestion: null, suggestion_status: null, accepted_version: null, decided_at: null,
  decided_by: null, attachments: [], resolved_at: null, resolved_by: null, created_by: { kind: 'user', session: null, slug: null },
  created_at: '2026-11-03T10:00:00Z', ...over,
})
