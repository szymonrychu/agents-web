// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { decision } from '../tasks/testUtils'
import { theme } from '../theme'
import type { Approval } from './api'
import { ApprovalsPage } from './ApprovalsPage'

const api = vi.hoisted(() => ({ listApprovals: vi.fn(), answerApprovals: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const ap = (id: number, slug: string, over: Partial<Approval> = {}): Approval => ({
  ...decision({ id, kind: 'approval', question: `Q${id}`, options: [], asking_slug: slug, expires_at: '2099-01-01T00:00:00Z' }),
  task_key: 'T-1', url: 'https://x/T-1', task_title: 'Task one', project: 'p', ...over,
})

beforeEach(() => {
  api.listApprovals.mockReset()
  api.answerApprovals.mockReset()
  api.listApprovals.mockResolvedValue({ items: [ap(1, 'beta'), ap(2, 'beta'), ap(3, 'gamma')] })
})
afterEach(cleanup)

const mount = () =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    </ThemeProvider>,
  )

test('groups open approvals by asker', async () => {
  mount()
  expect(await screen.findByText('beta (2)')).toBeTruthy()
  expect(screen.getByText('gamma (1)')).toBeTruthy()
  expect(api.listApprovals).toHaveBeenCalledWith({ status: 'open' })
  expect(screen.getAllByRole('link', { name: 'Task one' })[0].getAttribute('href')).toBe('/tasks/T-1')
})

test('Go selected sends only the checked ids', async () => {
  api.answerApprovals.mockResolvedValue({ items: [] })
  mount()
  await screen.findByText('beta (2)')
  expect((screen.getByRole('button', { name: 'Go selected (0)' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('D-1'))
  fireEvent.click(screen.getByLabelText('D-3'))
  fireEvent.click(screen.getByRole('button', { name: 'Go selected (2)' }))
  await waitFor(() => expect(api.answerApprovals).toHaveBeenCalledWith([{ id: 1, verdict: 'go' }, { id: 3, verdict: 'go' }]))
})

test('Go all sends every listed id and shows per-item results', async () => {
  api.answerApprovals.mockResolvedValue({ items: [{ id: 1, result: 'answered', task_key: 'T-1' }, { id: 2, result: 'expired', task_key: 'T-1' }] })
  mount()
  await screen.findByText('beta (2)')
  fireEvent.click(screen.getByRole('button', { name: 'Go all (3)' }))
  expect(await screen.findByText('D-1: Answered')).toBeTruthy()
  expect(screen.getByText('D-2: Expired')).toBeTruthy()
  expect(api.answerApprovals).toHaveBeenCalledWith([{ id: 1, verdict: 'go' }, { id: 2, verdict: 'go' }, { id: 3, verdict: 'go' }])
  await waitFor(() => expect(api.listApprovals).toHaveBeenCalledTimes(2))
})

test('empty list says so', async () => {
  api.listApprovals.mockResolvedValue({ items: [] })
  mount()
  expect(await screen.findByText('No open approvals')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Go all (0)' }) as HTMLButtonElement).disabled).toBe(true)
})
