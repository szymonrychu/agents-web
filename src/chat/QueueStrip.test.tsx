// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { MessageView } from '../api/client'
import { emittedCssFor } from '../test/emittedCss'
import { setViewport } from '../test/viewport'
import { theme } from '../theme'
import { QueueStrip } from './QueueStrip'

const api = vi.hoisted(() => ({ listMessages: vi.fn(), cancelMessage: vi.fn(), retryMessage: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api, statusStreamUrl: () => '/api/v1/stream' }))
vi.mock('../api/stream', () => ({ openStream: () => ({ close: () => {} }) }))

const msg = (over: Partial<MessageView>): MessageView =>
  ({ id: 1, agent_id: null, attempts: 0, session_id: 'c1', created_at: '2026-01-01T00:00:00Z', dispatched_at: null, error: null, max_attempts: 5, next_attempt_at: null, status: 'queued', target_agent_id: null, text: 'hello', turn: null, turn_id: null, ...over }) as MessageView

beforeEach(() => {
  api.listMessages.mockResolvedValue([msg({ id: 1, text: 'q one' }), msg({ id: 2, status: 'failed', text: 'f two', error: 'ambiguous: no answer' })])
  api.cancelMessage.mockResolvedValue(undefined)
  api.retryMessage.mockResolvedValue({ id: 2 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mount = () => render(<ThemeProvider theme={theme}><QueueStrip sessionId="c1" /></ThemeProvider>)
const row = (text: string) => screen.getByText(text).parentElement!.parentElement!

describe('QueueStrip on a phone', () => {
  beforeEach(() => setViewport(375, { coarse: true }))

  test('rows wrap and the actions are icon buttons with the same names', async () => {
    mount()
    await screen.findByText('q one')
    expect(emittedCssFor(row('q one'))).toContain('flex-wrap:wrap')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.classList).toContain('MuiIconButton-root')
    expect(cancel.textContent).toBe('')
    fireEvent.click(cancel)
    await waitFor(() => expect(api.cancelMessage).toHaveBeenCalledWith('1'))
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry.classList).toContain('MuiIconButton-root')
    fireEvent.click(retry)
    const anyway = await screen.findByRole('button', { name: 'Retry anyway' })
    expect(anyway.classList).toContain('MuiIconButton-root')
    fireEvent.click(anyway)
    await waitFor(() => expect(api.retryMessage).toHaveBeenCalledWith('2'))
  })
})

test('a desktop keeps text buttons', async () => {
  setViewport(1440)
  mount()
  await screen.findByText('q one')
  expect(screen.getByRole('button', { name: 'Cancel' }).textContent).toBe('Cancel')
  expect(screen.getByRole('button', { name: 'Retry' }).textContent).toBe('Retry')
})
