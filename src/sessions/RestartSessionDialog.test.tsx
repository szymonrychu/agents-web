// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { RestartSessionDialog } from './RestartSessionDialog'

const api = vi.hoisted(() => ({ restartSession: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const session = { id: 'c-1', slug: 'alpha' } as unknown as SessionView
const wrap = (onClose = vi.fn()) => {
  render(<ThemeProvider theme={theme}><RestartSessionDialog open session={session} onClose={onClose} /></ThemeProvider>)
  return onClose
}

beforeEach(() => { api.restartSession.mockReset() })
afterEach(cleanup)

describe('RestartSessionDialog', () => {
  test('restart_confirm_posts_and_closes', async () => {
    api.restartSession.mockResolvedValue({ command_ids: [1] })
    const onClose = wrap()
    expect(screen.getByText('Restart alpha?')).toBeTruthy()
    expect(screen.getByText('Every agent pod of this session is deleted and recreated. Running turns stop; queued messages wait for the new pods.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(api.restartSession).toHaveBeenCalledTimes(1)
    expect(api.restartSession).toHaveBeenCalledWith('c-1')
  })

  test('restart_409_session_deleting_shows_error_and_stays_open', async () => {
    api.restartSession.mockRejectedValue(new ApiError(409, 'session_deleting', 'deleting'))
    const onClose = wrap()
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(await screen.findByText('This session is being discarded')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Restart' }) as HTMLButtonElement).disabled).toBe(false))
  })

  test('restart_other_error_shows_message', async () => {
    api.restartSession.mockRejectedValue(new Error('boom'))
    const onClose = wrap()
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(await screen.findByText('boom')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('restart_confirm_is_disabled_while_in_flight', async () => {
    let resolve: (v: unknown) => void = () => {}
    api.restartSession.mockReturnValue(new Promise((r) => { resolve = r }))
    wrap()
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Restart' }) as HTMLButtonElement).disabled).toBe(true))
    resolve({ command_ids: [] })
  })

  test('restart_cancel_sends_nothing', async () => {
    const onClose = wrap()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.restartSession).not.toHaveBeenCalled()
  })
})
