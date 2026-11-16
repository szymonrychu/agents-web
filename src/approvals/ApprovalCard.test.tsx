// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { DecisionCard } from '../tasks/DecisionCard'
import { decision } from '../tasks/testUtils'
import type { Decision } from '../tasks/api'
import { theme } from '../theme'
import { ApprovalCard } from './ApprovalCard'

const tasksApi = vi.hoisted(() => ({ answerDecision: vi.fn() }))
vi.mock('../tasks/api', async (orig) => ({ ...(await orig<typeof import('../tasks/api')>()), ...tasksApi }))

beforeEach(() => {
  tasksApi.answerDecision.mockReset()
  tasksApi.answerDecision.mockResolvedValue({})
})
afterEach(cleanup)

const approval = (over: Partial<Decision> = {}): Decision =>
  decision({ id: 412, kind: 'approval', question: 'Merge PR 7?', subject: 'https://github.com/o/r/pull/7', expires_at: '2099-01-01T00:00:00Z', options: [], context: 'ctx text', ...over })

function setup(d: Decision, onChanged = vi.fn()) {
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <ApprovalCard taskKey="T-88" decision={d} onChanged={onChanged} />
      </MemoryRouter>
    </ThemeProvider>,
  )
  return onChanged
}

test('open card shows title, subject link, asker and context', () => {
  setup(approval())
  expect(screen.getByText('Merge PR 7?')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'https://github.com/o/r/pull/7' })).toBeTruthy()
  expect(screen.getByText('Asked by agent-x')).toBeTruthy()
  expect(screen.getByText(/^Expires in/)).toBeTruthy()
  expect(screen.getByText('ctx text')).toBeTruthy()
})

test('a plain subject is text, not a link', () => {
  setup(approval({ subject: 'the deploy' }))
  expect(screen.getByText('the deploy')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})

test('Go answers choice 0 with the note', async () => {
  const onChanged = setup(approval())
  fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'ship it' } })
  fireEvent.click(screen.getByRole('button', { name: 'Go' }))
  await waitFor(() => expect(tasksApi.answerDecision).toHaveBeenCalledWith('T-88', 412, { choice: 0, note: 'ship it' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

test('No-go answers choice 1', async () => {
  setup(approval())
  fireEvent.click(screen.getByRole('button', { name: 'No-go' }))
  await waitFor(() => expect(tasksApi.answerDecision).toHaveBeenCalledWith('T-88', 412, { choice: 1 }))
})

test('409 expired shows Expired and refetches', async () => {
  tasksApi.answerDecision.mockRejectedValue(new ApiError(409, 'expired', 'expired'))
  const onChanged = setup(approval())
  fireEvent.click(screen.getByRole('button', { name: 'Go' }))
  await screen.findByText('Expired')
  expect(onChanged).toHaveBeenCalled()
})

test('409 already_answered shows Already answered and refetches', async () => {
  tasksApi.answerDecision.mockRejectedValue(new ApiError(409, 'already_answered', 'x'))
  const onChanged = setup(approval())
  fireEvent.click(screen.getByRole('button', { name: 'No-go' }))
  await screen.findByText('Already answered')
  expect(onChanged).toHaveBeenCalled()
})

test('closed cards show the verdict with note, Expired, or withdrawn text', () => {
  setup(approval({ status: 'answered', answer: { choice: 0, label: 'Go' }, note: 'fine' }))
  expect(screen.getByText('Go (fine)')).toBeTruthy()
  cleanup()
  setup(approval({ status: 'answered', answer: { choice: 1, label: 'No-go' } }))
  expect(screen.getByText('No-go')).toBeTruthy()
  cleanup()
  setup(approval({ status: 'expired' }))
  expect(screen.getByText('Expired')).toBeTruthy()
  cleanup()
  setup(approval({ status: 'withdrawn', withdraw_reason: 'moot' }))
  expect(screen.getByText('Withdrawn: moot')).toBeTruthy()
})

test('a question decision still renders the option card', () => {
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <DecisionCard taskKey="T-1" decision={decision()} onChanged={vi.fn()} />
      </MemoryRouter>
    </ThemeProvider>,
  )
  expect(screen.getByLabelText('Own answer')).toBeTruthy()
})

test('DecisionCard delegates approvals', () => {
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <DecisionCard taskKey="T-1" decision={approval()} onChanged={vi.fn()} />
      </MemoryRouter>
    </ThemeProvider>,
  )
  expect(screen.getByRole('button', { name: 'No-go' })).toBeTruthy()
})
