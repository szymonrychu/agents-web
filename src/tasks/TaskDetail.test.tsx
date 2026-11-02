// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { decision, mountTasks, task } from './testUtils'

const api = vi.hoisted(() => ({
  getTask: vi.fn(), patchTask: vi.fn(), answerDecision: vi.fn(), patchTodoItem: vi.fn(), replaceTodo: vi.fn(), addComment: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, taskStreamUrl: () => '/tb/stream' }))
const stream = vi.hoisted(() => ({ opts: null as null | { onEvent: (d: unknown, i: { type: string; id: string }) => void } }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: { onEvent: (d: unknown, i: { type: string; id: string }) => void }) => {
    stream.opts = opts
    return { close: () => {} }
  },
}))

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getTask.mockResolvedValue(task({
    decisions: [decision()], open_decisions: 1, blocked: true, labels: ['infra'],
    todo: [{ id: 11, text: 'write tests', status: 'todo', position: 0 }],
    waiting_sessions: [{ session_id: 's1', slug: 'agent-x' }],
    comments: [{ id: 1, author_kind: 'user', author_session: null, author_slug: null, body: 'hello there', created_at: '2026-11-01T10:00:00Z' }],
    events: [{ id: 1, actor_kind: 'agent', actor_session: 's1', actor_slug: 'agent-x', kind: 'created', detail: null, at: '2026-11-01T10:00:00Z' }],
  }))
})
afterEach(cleanup)

describe('task detail', () => {
  test('shows description, waiting sessions, comments and history', async () => {
    mountTasks('/tasks/T-1')
    await screen.findByText('First task')
    expect(screen.getByText('Do it')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'agent-x' }).getAttribute('href')).toBe('/?session=s1')
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.getByText(/created/)).toBeTruthy()
  })

  test('answer form submits option or own text with note', async () => {
    api.answerDecision.mockResolvedValue(decision({ status: 'answered' }))
    mountTasks('/tasks/T-1')
    await screen.findByText('Which db?')
    expect(screen.getByText('Recommended')).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: /SQLite/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Note (optional)' }), 'because')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.answerDecision).toHaveBeenCalledWith('T-1', 5, { choice: 1, note: 'because' }))

    api.answerDecision.mockClear()
    await userEvent.type(screen.getByRole('textbox', { name: 'Own answer' }), 'Use Dolt')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.answerDecision).toHaveBeenCalledWith('T-1', 5, { text: 'Use Dolt', note: 'because' }))
  })

  test('submit stays disabled until an answer is given', async () => {
    mountTasks('/tasks/T-1')
    await screen.findByText('Which db?')
    expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('409 on answer shows already answered', async () => {
    api.answerDecision.mockRejectedValue(new ApiError(409, 'already_answered', 'decision is already answered'))
    mountTasks('/tasks/T-1')
    await screen.findByText('Which db?')
    const n = api.getTask.mock.calls.length
    await userEvent.click(screen.getByRole('radio', { name: /Postgres/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Already answered')).toBeTruthy()
    await waitFor(() => expect(api.getTask.mock.calls.length).toBeGreaterThan(n))
  })

  test('todo toggle calls PATCH', async () => {
    api.patchTodoItem.mockResolvedValue(task())
    mountTasks('/tasks/T-1')
    await screen.findByText('write tests')
    const group = screen.getByRole('group', { name: 'Status of write tests' })
    await userEvent.click(within(group).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(api.patchTodoItem).toHaveBeenCalledWith('T-1', 11, { status: 'done' }))
  })

  test('todo add and remove replace the list', async () => {
    api.replaceTodo.mockResolvedValue(task())
    mountTasks('/tasks/T-1')
    await screen.findByText('write tests')
    await userEvent.type(screen.getByRole('textbox', { name: 'New item' }), 'ship it')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.replaceTodo).toHaveBeenCalledWith('T-1', [{ text: 'write tests', status: 'todo' }, { text: 'ship it', status: 'todo' }]))
    await userEvent.click(screen.getByRole('button', { name: 'Remove write tests' }))
    await waitFor(() => expect(api.replaceTodo).toHaveBeenLastCalledWith('T-1', []))
  })

  test('missing task shows not found with list link', async () => {
    api.getTask.mockRejectedValue(new ApiError(404, 'not_found', 'no task T-9'))
    mountTasks('/tasks/T-9')
    expect(await screen.findByText('Task T-9 not found')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to tasks' }).getAttribute('href')).toBe('/tasks')
  })

  test('stream event refetches the task', async () => {
    mountTasks('/tasks/T-1')
    await screen.findByText('First task')
    const n = api.getTask.mock.calls.length
    await act(async () => stream.opts?.onEvent({ key: 'T-2' }, { type: 'task_changed', id: '1' }))
    expect(api.getTask.mock.calls.length).toBe(n)
    await act(async () => stream.opts?.onEvent({ key: 'T-1' }, { type: 'task_changed', id: '2' }))
    await waitFor(() => expect(api.getTask.mock.calls.length).toBeGreaterThan(n))
  })

  test('detail label edit sends PATCH with version', async () => {
    api.patchTask.mockResolvedValue(task())
    mountTasks('/tasks/T-1')
    await screen.findByText('First task')
    await userEvent.type(screen.getByRole('combobox', { name: 'Labels' }), 'p1{Enter}')
    await waitFor(() => expect(api.patchTask).toHaveBeenCalledWith('T-1', { version: 3, labels: ['infra', 'p1'] }))
  })

  test('description edit sends PATCH with version and a stale version reloads', async () => {
    api.patchTask.mockRejectedValue(new ApiError(412, 'stale_version', 'task changed since it was read'))
    mountTasks('/tasks/T-1')
    await screen.findByText('First task')
    await userEvent.click(screen.getByRole('button', { name: 'Edit description' }))
    const box = screen.getByRole('textbox', { name: 'Description' })
    await userEvent.clear(box)
    await userEvent.type(box, 'New text')
    const n = api.getTask.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchTask).toHaveBeenCalledWith('T-1', { version: 3, body: 'New text' }))
    expect(await screen.findByText(/changed since you opened it/)).toBeTruthy()
    await waitFor(() => expect(api.getTask.mock.calls.length).toBeGreaterThan(n))
  })

  test('adding a comment posts it', async () => {
    api.addComment.mockResolvedValue(task())
    mountTasks('/tasks/T-1')
    await screen.findByText('First task')
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'nice')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.addComment).toHaveBeenCalledWith('T-1', 'nice'))
  })
})
