// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { CodeEditorProps } from '../editor/CodeEditor'
import { task } from '../tasks/testUtils'
import { PlanTab } from './PlanTab'
import { plan, step } from './testUtils'

vi.mock('../editor/CodeEditor', () => ({
  default: function CodeEditorStandIn(props: CodeEditorProps) {
    return (
      <div data-testid="file-editor">
        <span data-testid="editor-doc">{props.doc}</span>
        <button type="button" onClick={() => props.onChange('new body')}>stand-in change</button>
      </div>
    )
  },
}))
const api = vi.hoisted(() => ({
  getPlan: vi.fn(), listSteps: vi.fn(), insertStep: vi.fn(), reorderSteps: vi.fn(), setDeps: vi.fn(), patchStep: vi.fn(), putPlan: vi.fn(), getStepTask: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
vi.mock('../api/stream', () => ({ openStream: () => ({ close: () => {} }) }))
vi.mock('../markdown/MermaidBlock', () => ({ MermaidBlock: () => <div /> }))

const steps = () => [
  step({ key: 'T-11', step: 1, title: 'One', status: 'done', version: 4 }),
  step({ key: 'T-12', step: 2, title: 'Two', status: 'open', version: 5, deps: ['T-11'], model: 'sonnet' }),
  step({ key: 'T-13', step: 3, title: 'Three', status: 'in_progress', version: 6 }),
]

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getPlan.mockResolvedValue(plan({ version: 1 }))
  api.listSteps.mockResolvedValue({ items: steps(), steps_version: 9 })
  api.getStepTask.mockImplementation(async (key: string) => task({ key, title: key === 'T-12' ? 'Two' : 'x', body: 'old body', version: 7, model: 'sonnet', depends_on: key === 'T-12' ? ['T-11'] : [] }))
  api.insertStep.mockResolvedValue(step({ key: 'T-14', step: 3 }))
  api.reorderSteps.mockResolvedValue({ steps_version: 10 })
  api.patchStep.mockResolvedValue(task())
  api.setDeps.mockResolvedValue(task())
})
afterEach(cleanup)

const mount = () => render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)

describe('step editor', () => {
  test('add after a step posts after and steps_version', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add step after 2' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Inserted')
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }))
    await waitFor(() => expect(api.insertStep).toHaveBeenCalledWith('S-1', { steps_version: 9, after: 2, title: 'Inserted', body: '', model: undefined }))
    await waitFor(() => expect(api.listSteps.mock.calls.length).toBeGreaterThan(1))
  })

  test('the Add step button at the end sends no after', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add step at end' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Last')
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }))
    await waitFor(() => expect(api.insertStep).toHaveBeenCalled())
    expect(api.insertStep.mock.calls[0][1]).not.toHaveProperty('after')
  })

  test('editing title, body and model PATCHes the task with its version', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    expect(await screen.findByTestId('editor-doc')).toHaveProperty('textContent', 'old body')
    const title = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Two b')
    await userEvent.click(screen.getByRole('button', { name: 'stand-in change' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    await userEvent.click(screen.getByRole('option', { name: 'opus' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() => expect(api.patchStep).toHaveBeenCalledWith('T-12', { version: 7, title: 'Two b', body: 'new body', model: 'opus' }))
  })

  test('up and down send the full order of keys with steps_version', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Move step 2 up' }))
    await waitFor(() => expect(api.reorderSteps).toHaveBeenCalledWith('S-1', 9, ['T-12', 'T-11', 'T-13']))
    await userEvent.click(await screen.findByRole('button', { name: 'Move step 2 down' }))
    await waitFor(() => expect(api.reorderSteps).toHaveBeenLastCalledWith('S-1', 9, ['T-11', 'T-13', 'T-12']))
  })

  test('the first step has no up and the last no down', async () => {
    mount()
    await screen.findByText('One')
    expect((screen.getByRole('button', { name: 'Move step 1 up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Move step 3 down' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('the deps picker leaves out the step itself and saves the chosen keys', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    await screen.findByTestId('editor-doc')
    expect(screen.queryByRole('checkbox', { name: /^2 / })).toBeNull()
    expect((screen.getByRole('checkbox', { name: /^1 / }) as HTMLInputElement).checked).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: /^3 / }))
    await userEvent.click(screen.getByRole('button', { name: 'Save dependencies' }))
    await waitFor(() => expect(api.setDeps).toHaveBeenCalledWith('T-12', ['T-11', 'T-13']))
  })

  test('a 422 dependency_cycle shows the server message', async () => {
    api.setDeps.mockRejectedValue(new ApiError(422, 'dependency_cycle', 'the dependencies would form a cycle'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    await screen.findByTestId('editor-doc')
    await userEvent.click(screen.getByRole('checkbox', { name: /^3 / }))
    await userEvent.click(screen.getByRole('button', { name: 'Save dependencies' }))
    expect(await screen.findByText(/would form a cycle/)).toBeTruthy()
  })

  test('drop is offered only for unstarted steps and sets dropped with the step version', async () => {
    mount()
    await screen.findByText('One')
    expect(screen.queryByRole('button', { name: 'Drop step 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Drop step 3' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Drop step 2' }))
    await waitFor(() => expect(api.patchStep).toHaveBeenCalledWith('T-12', { version: 5, status: 'dropped' }))
  })

  test.each([
    ['reorder 412', () => api.reorderSteps.mockRejectedValue(new ApiError(412, 'stale_version', 'changed', { current_steps_version: 11 })), 'Move step 2 up'],
    ['insert 412', () => api.insertStep.mockRejectedValue(new ApiError(412, 'stale_version', 'changed', { current_steps_version: 11 })), 'Add step at end'],
    ['drop 409', () => api.patchStep.mockRejectedValue(new ApiError(409, 'step_in_progress', 'started')), 'Drop step 2'],
  ])('%s shows "changed meanwhile, reloaded" and refetches', async (_n, arrange, button) => {
    arrange()
    mount()
    await userEvent.click(await screen.findByRole('button', { name: button }))
    if (button === 'Add step at end') {
      await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Last')
      await userEvent.click(screen.getByRole('button', { name: 'Add step' }))
    }
    expect(await screen.findByText(/changed meanwhile, reloaded/)).toBeTruthy()
    await waitFor(() => expect(api.listSteps.mock.calls.length).toBeGreaterThan(1))
  })

  test('editing a step whose task changed (412) shows the notice and reloads', async () => {
    api.patchStep.mockRejectedValue(new ApiError(412, 'stale_version', 'task changed since it was read'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    await screen.findByTestId('editor-doc')
    await userEvent.click(screen.getByRole('button', { name: 'stand-in change' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(await screen.findByText(/changed meanwhile, reloaded/)).toBeTruthy()
    await waitFor(() => expect(api.getStepTask.mock.calls.length).toBeGreaterThan(1))
  })

  test('saving dependencies keeps unsaved title, body and model edits', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    await screen.findByTestId('editor-doc')
    const title = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Draft title')
    await userEvent.click(screen.getByRole('button', { name: 'stand-in change' }))
    api.getStepTask.mockImplementation(async (key: string) => task({ key, title: 'Two', body: 'old body', version: 8, model: 'sonnet', depends_on: ['T-11', 'T-13'] }))
    await userEvent.click(screen.getByRole('checkbox', { name: /^3 / }))
    await userEvent.click(screen.getByRole('button', { name: 'Save dependencies' }))
    await waitFor(() => expect(api.setDeps).toHaveBeenCalled())
    await waitFor(() => expect(api.getStepTask.mock.calls.length).toBeGreaterThan(1))
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Draft title')
    expect(screen.getByTestId('editor-doc').textContent).toBe('new body')
    await userEvent.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() => expect(api.patchStep).toHaveBeenCalledWith('T-12', { version: 8, title: 'Draft title', body: 'new body' }))
  })

  test('a 412 keeps the draft and shows the server newer values', async () => {
    api.patchStep.mockRejectedValue(new ApiError(412, 'stale_version', 'task changed since it was read'))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit step 2' }))
    await screen.findByTestId('editor-doc')
    const title = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Draft title')
    api.getStepTask.mockImplementation(async (key: string) => task({ key, title: 'Server title', body: 'old body', version: 9, model: 'sonnet', depends_on: ['T-11'] }))
    await userEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(await screen.findByText(/changed meanwhile, reloaded/)).toBeTruthy()
    expect(await screen.findByText(/Server title/)).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Draft title')
  })

  test('a double click on Up sends one reorder', async () => {
    api.reorderSteps.mockImplementation(() => new Promise((r) => setTimeout(() => r({ steps_version: 10 }), 50)))
    mount()
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Move step 2 up' }))
    await waitFor(() => expect(api.reorderSteps).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 100))
    expect(api.reorderSteps).toHaveBeenCalledTimes(1)
  })
})
