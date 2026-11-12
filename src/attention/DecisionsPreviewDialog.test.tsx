// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import type { Task } from '../tasks/api'
import { decision, task } from '../tasks/testUtils'
import { theme } from '../theme'
import { DecisionsPreviewDialog } from './DecisionsPreviewDialog'

const tasksApi = vi.hoisted(() => ({ answerDecision: vi.fn() }))
vi.mock('../tasks/api', async (orig) => ({ ...(await orig<typeof import('../tasks/api')>()), ...tasksApi }))

const SESSION = { id: 's1', slug: 'beta', desired: 'active', status: {}, spec: {}, summary: {} } as unknown as SessionView
const scroll = vi.fn()

beforeEach(() => {
  scroll.mockReset()
  Element.prototype.scrollIntoView = scroll
  tasksApi.answerDecision.mockReset()
  tasksApi.answerDecision.mockResolvedValue({})
})
afterEach(cleanup)

function setup(tasks: Task[]) {
  const props = { session: SESSION, tasks, onClose: vi.fn(), onChanged: vi.fn() }
  const ui = (p: typeof props) => (
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <DecisionsPreviewDialog {...p} />
      </MemoryRouter>
    </ThemeProvider>
  )
  const r = render(ui(props))
  return { props, rerender: (tasks: Task[]) => r.rerender(ui({ ...props, tasks })) }
}

/** Lets the dialog's enter transition (theme enteringScreen, 225 ms) finish. */
const entered = () => act(() => new Promise<void>((r) => setTimeout(r, 400)))

const T1 = task({ key: 'T-1', title: 'Pick a db', decisions: [decision({ id: 1, question: 'Which db?' }), decision({ id: 2, question: 'Other session', asking_session: 's2' }), decision({ id: 3, question: 'Old one', status: 'answered', answer: { text: 'x' } })] })
const T2 = task({ key: 'T-2', title: 'Pick a cache', decisions: [decision({ id: 4, question: 'Which cache?' })] })

describe('DecisionsPreviewDialog', () => {
  test('lists only open decisions asked by the session, with task links', async () => {
    setup([T1, T2])
    const dialog = screen.getByRole('dialog', { name: 'Decisions waiting in beta' })
    expect(within(dialog).getByRole('link', { name: 'T-1' }).getAttribute('href')).toBe('/tasks/T-1')
    expect(within(dialog).getByRole('link', { name: 'T-2' }).getAttribute('href')).toBe('/tasks/T-2')
    expect(within(dialog).getByText('Pick a db')).toBeTruthy()
    expect(within(dialog).getByText('Which db?')).toBeTruthy()
    expect(within(dialog).getByText('Which cache?')).toBeTruthy()
    expect(within(dialog).queryByText('Other session')).toBeNull()
    expect(within(dialog).queryByText('Old one')).toBeNull()
  })

  test('scrolls to the first open decision once after the enter transition', async () => {
    setup([T1, T2])
    await entered()
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    const node = scroll.mock.contexts[0] as HTMLElement
    expect(node.textContent).toContain('Which db?')
    expect(node.textContent).not.toContain('Which cache?')
  })

  test('scroll waits for decisions that arrive after the transition', async () => {
    const { props, rerender } = setup([])
    await entered()
    await act(async () => {})
    expect(scroll).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
    rerender([T2])
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    expect((scroll.mock.contexts[0] as HTMLElement).textContent).toContain('Which cache?')
  })

  test('does not scroll again on refresh', async () => {
    const { rerender } = setup([T1, T2])
    await entered()
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
    rerender([T2])
    await act(async () => {})
    rerender([T1, T2])
    await act(async () => {})
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  test('answering calls onChanged', async () => {
    const { props } = setup([T2])
    fireEvent.click(screen.getByRole('radio', { name: /SQLite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
    expect(tasksApi.answerDecision).toHaveBeenCalledWith('T-2', 4, { choice: 1 })
  })

  test('closes itself when no open decision is left', async () => {
    const { props, rerender } = setup([T2])
    expect(props.onClose).not.toHaveBeenCalled()
    rerender([{ ...T2, decisions: [decision({ id: 4, status: 'answered', answer: { choice: 0, label: 'Postgres' } })] }])
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
  })

  test('the close button closes', () => {
    const { props } = setup([T2])
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
