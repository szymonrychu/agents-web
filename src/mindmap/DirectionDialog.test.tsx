// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { DirectionDialog } from './DirectionDialog'
import { direction } from './testUtils'

const api = vi.hoisted(() => ({ createDirection: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const onSaved = vi.fn()
const mount = (node?: string) =>
  render(<ThemeProvider theme={theme}><DirectionDialog mapKey="M-1" nodeKey={node} onClose={() => {}} onSaved={onSaved} /></ThemeProvider>)
const submit = () => screen.getByRole('button', { name: 'Send direction' }) as HTMLButtonElement

beforeEach(() => {
  api.createDirection.mockReset()
  onSaved.mockReset()
  api.createDirection.mockResolvedValue(direction())
})
afterEach(cleanup)

describe('DirectionDialog', () => {
  test('needs text', async () => {
    mount()
    expect(submit().disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Direction'), 'dig in')
    expect(submit().disabled).toBe(false)
  })

  test('posts on the map with seed growth areas, one per line, and no task', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Direction'), 'dig in')
    await u.type(screen.getByLabelText(/Seed growth areas/), 'first{Enter}{Enter}second')
    await u.click(submit())
    await waitFor(() => expect(api.createDirection).toHaveBeenCalledWith('M-1', { text: 'dig in', growth_areas: ['first', 'second'] }))
    expect(onSaved).toHaveBeenCalled()
  })

  test('posts on a node with a valid task key', async () => {
    const u = userEvent.setup()
    mount('N-2')
    await u.type(screen.getByLabelText('Direction'), 'dig in')
    await u.type(screen.getByLabelText('Task key (optional)'), 'T-12')
    await u.click(submit())
    await waitFor(() => expect(api.createDirection).toHaveBeenCalledWith('M-1', { text: 'dig in', node: 'N-2', task: 'T-12', growth_areas: [] }))
  })

  test.each(['T-0', 'T12', 't-1', 'T-01', 'T-'])('rejects the task key %s', async (bad) => {
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Direction'), 'dig in')
    await u.type(screen.getByLabelText('Task key (optional)'), bad)
    expect(submit().disabled).toBe(true)
    expect(screen.getByText(/like T-12/)).toBeTruthy()
  })
})
