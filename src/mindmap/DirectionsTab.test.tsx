// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { DirectionsTab } from './DirectionsTab'
import { direction } from './testUtils'

const api = vi.hoisted(() => ({ listDirections: vi.fn(), patchDirection: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const onOpenNode = vi.fn()
const onChanged = vi.fn()
const mount = (selected?: string) =>
  render(<ThemeProvider theme={theme}><DirectionsTab mapKey="M-1" refreshKey={0} selected={selected} onOpenNode={onOpenNode} onChanged={onChanged} /></ThemeProvider>)

const all = [
  direction({ key: 'D-1', status: 'open', origin: 'user', text: 'open one' }),
  direction({ key: 'D-2', status: 'acknowledged', origin: 'agent', text: 'ack one', acknowledged_by: 'agent-7', acknowledged_at: '2026-11-02T10:00:00Z', version: 2 }),
  direction({ key: 'D-3', status: 'resolved', text: 'resolved one', resolution: 'done in N-5', resolved_by: 'agent-7', resolved_at: '2026-11-03T10:00:00Z', node: null }),
  direction({ key: 'D-4', status: 'withdrawn', text: 'withdrawn one' }),
]
beforeEach(() => {
  api.listDirections.mockReset()
  api.patchDirection.mockReset()
  onOpenNode.mockReset()
  onChanged.mockReset()
  api.listDirections.mockResolvedValue(all)
  api.patchDirection.mockResolvedValue(direction())
})
afterEach(cleanup)

const card = async (key: string) => (await screen.findByTestId(`direction-${key}`)) as HTMLElement

describe('DirectionsTab', () => {
  test('lists directions of the map in every state', async () => {
    mount()
    for (const [k, s] of [['D-1', 'open'], ['D-2', 'acknowledged'], ['D-3', 'resolved'], ['D-4', 'withdrawn']] as const) {
      expect(within(await card(k)).getByText(s)).toBeTruthy()
    }
    expect(api.listDirections).toHaveBeenCalledWith({ map: 'M-1' })
  })

  test('shows the origin chip and the trail', async () => {
    mount()
    expect(within(await card('D-1')).getByText('user')).toBeTruthy()
    const ack = await card('D-2')
    expect(within(ack).getByText('agent')).toBeTruthy()
    expect(within(ack).getByText(/acknowledged by agent-7/)).toBeTruthy()
    const done = await card('D-3')
    expect(within(done).getByText(/resolved by agent-7/)).toBeTruthy()
    expect(within(done).getByText(/done in N-5/)).toBeTruthy()
  })

  test('offers withdraw for open and acknowledged only', async () => {
    mount()
    await card('D-1')
    expect(screen.getByRole('button', { name: 'Withdraw D-1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Withdraw D-2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Withdraw D-3' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Withdraw D-4' })).toBeNull()
  })

  test('withdraw sends the row version and refreshes', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Withdraw D-2' }))
    await waitFor(() => expect(api.patchDirection).toHaveBeenCalledWith('D-2', { version: 2, action: 'withdraw' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test('an invalid_transition answer is shown and the list reloads', async () => {
    api.patchDirection.mockRejectedValueOnce(new ApiError(409, 'invalid_transition', 'cannot withdraw a resolved direction'))
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Withdraw D-1' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot withdraw/)
    await waitFor(() => expect(api.listDirections).toHaveBeenCalledTimes(2))
  })

  test('a successful reload clears an earlier list error', async () => {
    api.listDirections.mockRejectedValueOnce(new ApiError(500, 'boom', 'list failed'))
    const u = userEvent.setup()
    mount()
    expect((await screen.findByRole('alert')).textContent).toMatch(/list failed/)
    await u.click(screen.getByRole('combobox', { name: 'State' }))
    await u.click(await screen.findByRole('option', { name: 'open' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  test('a node link opens the node; the selected direction is marked', async () => {
    const u = userEvent.setup()
    mount('D-2')
    expect((await card('D-2')).getAttribute('aria-current')).toBe('true')
    await u.click(within(await card('D-1')).getByRole('button', { name: 'N-2' }))
    expect(onOpenNode).toHaveBeenCalledWith('N-2')
  })

  test('the status filter narrows the request', async () => {
    const u = userEvent.setup()
    mount()
    await card('D-1')
    await u.click(screen.getByRole('combobox', { name: 'State' }))
    await u.click(await screen.findByRole('option', { name: 'open' }))
    await waitFor(() => expect(api.listDirections).toHaveBeenLastCalledWith({ map: 'M-1', status: 'open' }))
  })
})
