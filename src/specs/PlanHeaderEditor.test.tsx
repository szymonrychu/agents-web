// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { PlanHeaderEditor } from './PlanHeaderEditor'
import { plan } from './testUtils'

const api = vi.hoisted(() => ({ putPlan: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

beforeEach(() => {
  api.putPlan.mockReset()
  api.putPlan.mockResolvedValue(plan({ version: 5 }))
})
afterEach(cleanup)

const header = plan({ goal: 'Old goal', architecture: 'arch', tech_stack: 'py', constraints: ['a', 'b'], review_focus: ['x'], version: 4 })

describe('plan header editor', () => {
  test('PUTs the edited fields with the header version', async () => {
    const onSaved = vi.fn()
    render(<PlanHeaderEditor specKey="S-1" plan={header} onSaved={onSaved} onConflict={vi.fn()} />)
    const goal = screen.getByRole('textbox', { name: 'Goal' })
    await userEvent.clear(goal)
    await userEvent.type(goal, 'New goal')
    const constraints = screen.getByRole('textbox', { name: 'Constraints' })
    expect((constraints as HTMLTextAreaElement).value).toBe('a\nb')
    await userEvent.type(constraints, '\nc')
    await userEvent.click(screen.getByRole('button', { name: 'Save plan header' }))
    await waitFor(() => expect(api.putPlan).toHaveBeenCalledWith('S-1', { version: 4, goal: 'New goal', architecture: 'arch', tech_stack: 'py', constraints: ['a', 'b', 'c'], review_focus: ['x'] }))
    expect(onSaved).toHaveBeenCalled()
  })

  test('blank lines are dropped from the lists', async () => {
    render(<PlanHeaderEditor specKey="S-1" plan={header} onSaved={vi.fn()} onConflict={vi.fn()} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Review focus' }), '\n\n  \ny')
    await userEvent.click(screen.getByRole('button', { name: 'Save plan header' }))
    await waitFor(() => expect(api.putPlan).toHaveBeenCalled())
    expect(api.putPlan.mock.calls[0][1].review_focus).toEqual(['x', 'y'])
  })

  test('a 412 shows "changed meanwhile, reloaded" and calls onConflict', async () => {
    api.putPlan.mockRejectedValue(new ApiError(412, 'stale_version', 'changed', { current_version: 6 }))
    const onConflict = vi.fn()
    render(<PlanHeaderEditor specKey="S-1" plan={header} onSaved={vi.fn()} onConflict={onConflict} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save plan header' }))
    expect(await screen.findByText(/changed meanwhile, reloaded/)).toBeTruthy()
    expect(onConflict).toHaveBeenCalled()
  })

  test('over-long input is refused before any request', async () => {
    render(<PlanHeaderEditor specKey="S-1" plan={header} onSaved={vi.fn()} onConflict={vi.fn()} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Goal' }), 'x'.repeat(501), { delay: null })
    expect((screen.getByRole('button', { name: 'Save plan header' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.putPlan).not.toHaveBeenCalled()
  })
})
