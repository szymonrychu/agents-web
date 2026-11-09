// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mountTasks, task } from './testUtils'

const ctx = vi.hoisted(() => ({ project: null as string | null, projects: [] as { slug: string; name: string }[] }))
vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ ...ctx, setProject: () => {} }) }))
const api = vi.hoisted(() => ({ listTasks: vi.fn(), createTask: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, taskStreamUrl: () => '/tb/stream' }))
const stream = vi.hoisted(() => ({ opts: null as null | { onEvent: (d: unknown, i: { type: string; id: string }) => void } }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: { onEvent: (d: unknown, i: { type: string; id: string }) => void }) => {
    stream.opts = opts
    return { close: () => {} }
  },
}))

const loc = () => screen.getByTestId('loc').textContent ?? ''
const lastCall = () => api.listTasks.mock.calls.at(-1)?.[0]

beforeEach(() => {
  api.listTasks.mockReset()
  api.createTask.mockReset()
  api.listTasks.mockResolvedValue({ items: [task({ key: 'T-2', title: 'Blocked one', open_decisions: 2, blocked: true, labels: ['infra', 'p1'], assignee_session: 's1' }), task()], next_cursor: null })
})
afterEach(cleanup)

describe('tasks list', () => {
  test('default list excludes done and dropped', async () => {
    mountTasks('/tasks')
    await screen.findByText('First task')
    expect(lastCall()).toMatchObject({ status: 'active' })
    expect(loc()).toBe('/tasks')
  })

  test('list is filtered by the selected project and shows it', async () => {
    ctx.project = 'infra'
    api.listTasks.mockResolvedValue({ items: [task({ project: 'infra' })], next_cursor: null })
    mountTasks('/tasks')
    await screen.findByText('First task')
    expect(lastCall()).toMatchObject({ project: 'infra' })
    expect(screen.getAllByText('infra', { selector: '.MuiChip-label' }).length).toBeGreaterThan(0)
    ctx.project = null
  })

  test('blocked chip shows open decision count', async () => {
    mountTasks('/tasks')
    expect(await screen.findByText('Blocked (2)')).toBeTruthy()
    expect(screen.getAllByText(/^Blocked \(/)).toHaveLength(1)
  })

  test('list shows label chips and the assignee link', async () => {
    mountTasks('/tasks')
    await screen.findByText('Blocked one')
    const row = screen.getByText('Blocked one').closest('tr') as HTMLElement
    expect(within(row).getByText('infra')).toBeTruthy()
    expect(within(row).getByText('p1')).toBeTruthy()
    expect(within(row).getByRole('link', { name: 's1' }).getAttribute('href')).toBe('/tasks?session=s1')
  })

  test('filters write status and session to the URL', async () => {
    mountTasks('/tasks')
    await screen.findByText('First task')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(loc()).toBe('/tasks?status=done')
    await waitFor(() => expect(lastCall()).toMatchObject({ status: 'done' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Session' }), 'sess-9')
    expect(loc()).toBe('/tasks?status=done&session=sess-9')
    await userEvent.click(screen.getByRole('button', { name: 'Active' }))
    expect(loc()).toBe('/tasks?session=sess-9')
  })

  test('label filter writes repeated label params to the URL', async () => {
    mountTasks('/tasks')
    await screen.findByText('First task')
    const input = screen.getByRole('combobox', { name: 'Labels' })
    await userEvent.type(input, 'a{Enter}')
    await userEvent.type(input, 'b{Enter}')
    expect(loc()).toBe('/tasks?label=a&label=b')
    await waitFor(() => expect(lastCall()).toMatchObject({ labels: ['a', 'b'] }))
  })

  test('chip click adds the label filter', async () => {
    mountTasks('/tasks?label=p1')
    await screen.findByText('Blocked one')
    const row = screen.getByText('Blocked one').closest('tr') as HTMLElement
    await userEvent.click(within(row).getByText('infra'))
    expect(loc()).toBe('/tasks?label=p1&label=infra')
    await userEvent.click(within(row).getByText('infra'))
    expect(loc()).toBe('/tasks?label=p1&label=infra')
  })

  test('a stream event refetches the list', async () => {
    mountTasks('/tasks')
    await screen.findByText('First task')
    const n = api.listTasks.mock.calls.length
    await act(async () => stream.opts?.onEvent({ key: 'T-9' }, { type: 'task_changed', id: '1' }))
    await waitFor(() => expect(api.listTasks.mock.calls.length).toBeGreaterThan(n))
  })

  test('create dialog posts a task with labels and opens it', async () => {
    ctx.project = 'infra'
    api.createTask.mockResolvedValue(task({ key: 'T-7' }))
    mountTasks('/tasks')
    await screen.findByText('First task')
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Write docs')
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Labels' }), 'Docs{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createTask).toHaveBeenCalled())
    expect(api.createTask.mock.calls[0][0]).toMatchObject({ title: 'Write docs', kind: 'task', labels: ['docs'], project: 'infra' })
    ctx.project = null
    await waitFor(() => expect(loc()).toBe('/tasks/T-7'))
  })
})
