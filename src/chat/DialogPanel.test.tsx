// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DialogView } from '../api/client'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { DialogPanel } from './DialogPanel'

const getAgentDialog = vi.hoisted(() => vi.fn())
const answerAgentDialog = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), getAgentDialog, answerAgentDialog }))

const AID = '11111111-1111-1111-1111-111111111111'
const RID = 'perm_0123456789ab'

beforeEach(() => {
  getAgentDialog.mockReset()
  answerAgentDialog.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const perm = (o: Record<string, unknown> = {}) => ({
  agent_id: null, expires_at: new Date(Date.now() + 65_000).toISOString(), request_id: RID, since: '2026-11-09T10:00:00Z', suggestions: [], tool_input: 'rm -rf /tmp/x', tool_name: 'Bash', truncated: false, ...o,
})
const view = (o: Partial<DialogView>): DialogView => ({ agent_id: AID, session_id: AID, kind: 'none', since: null, tail: null, permission: null, ...o }) as DialogView

async function mount(v: DialogView, onClose: () => void = () => {}) {
  getAgentDialog.mockResolvedValue(v)
  render(
    <ThemeProvider theme={theme}>
      <DialogPanel open agentId={AID} agentLabel="alpha-1" onClose={onClose} />
    </ThemeProvider>,
  )
  await waitFor(() => expect(getAgentDialog).toHaveBeenCalledWith(AID))
}

const permView = (o: Record<string, unknown> = {}) => view({ kind: 'permission', since: '2026-11-09T10:00:00Z', permission: perm(o) as never })

describe('DialogPanel', () => {
  test('permission_allow_once', async () => {
    answerAgentDialog.mockResolvedValue({ agent_id: AID, status: 'answered' })
    const onClose = vi.fn()
    await mount(permView(), onClose)
    expect(await screen.findByText('Permission request - alpha-1')).toBeTruthy()
    expect(screen.getByText('Tool: Bash')).toBeTruthy()
    expect(screen.getByText('rm -rf /tmp/x').tagName).toBe('PRE')
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(answerAgentDialog).toHaveBeenCalledWith(AID, { action: 'allow', request_id: RID })
  })

  test('permission_deny_with_message_confirms_first', async () => {
    answerAgentDialog.mockResolvedValue({ agent_id: AID, status: 'answered' })
    const onClose = vi.fn()
    await mount(permView(), onClose)
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }))
    expect(answerAgentDialog).not.toHaveBeenCalled()
    expect(screen.getByText('Deny this action?')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Message to the agent (optional)'), { target: { value: 'use a safer path' } })
    expect(answerAgentDialog).not.toHaveBeenCalled()
    const buttons = screen.getAllByRole('button', { name: 'Deny' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(answerAgentDialog).toHaveBeenCalledWith(AID, { action: 'deny', request_id: RID, message: 'use a safer path' })
  })

  test('permission_deny_blank_message_omitted', async () => {
    answerAgentDialog.mockResolvedValue({ agent_id: AID, status: 'answered' })
    await mount(permView())
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }))
    fireEvent.change(screen.getByLabelText('Message to the agent (optional)'), { target: { value: '   ' } })
    const buttons = screen.getAllByRole('button', { name: 'Deny' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(answerAgentDialog).toHaveBeenCalled())
    expect(answerAgentDialog.mock.calls[0][1]).toEqual({ action: 'deny', request_id: RID })
  })

  test('truncated input shows a note', async () => {
    await mount(permView({ truncated: true }))
    expect(await screen.findByText('The input was truncated.')).toBeTruthy()
  })

  test('countdown_ticks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'))
    getAgentDialog.mockResolvedValue(permView({ expires_at: '2026-11-09T10:01:05Z' }))
    render(
      <ThemeProvider theme={theme}>
        <DialogPanel open agentId={AID} agentLabel="alpha-1" onClose={() => {}} />
      </ThemeProvider>,
    )
    await act(async () => {})
    expect(screen.getByText('auto-deny in 1:05')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByText('auto-deny in 1:04')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000) })
    expect(screen.getByText('auto-deny due')).toBeTruthy()
  })

  test('dialog_dismiss_sends_expect_since', async () => {
    answerAgentDialog.mockResolvedValue({ agent_id: AID, status: 'dismissed' })
    const onClose = vi.fn()
    await mount(view({ kind: 'dialog', since: 'S1', tail: 'Trust this folder?' }), onClose)
    expect(await screen.findByText('Trust this folder?').then((e) => e.tagName)).toBe('PRE')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(answerAgentDialog).toHaveBeenCalledWith(AID, { action: 'dismiss', expect_since: 'S1' })
  })

  test('dismiss_still_open_stays', async () => {
    answerAgentDialog.mockResolvedValue({ agent_id: AID, status: 'still_open' })
    const onClose = vi.fn()
    await mount(view({ kind: 'dialog', since: 'S1', tail: 'x' }), onClose)
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('The dialog is still open')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  test('usage_wait_read_only', async () => {
    await mount(view({ kind: 'usage_wait', tail: 'x' }))
    expect(await screen.findByText('Claude is waiting for the usage limit to reset; it continues automatically')).toBeTruthy()
    for (const n of ['Allow once', 'Deny', 'Dismiss']) expect(screen.queryByRole('button', { name: n })).toBeNull()
  })

  test('none shows nothing waiting', async () => {
    await mount(view({ kind: 'none' }))
    expect(await screen.findByText('Nothing is waiting on this agent')).toBeTruthy()
  })

  test('footer_only_permission_offers_dismiss_only', async () => {
    await mount(view({ kind: 'permission', since: 'S2', tail: 'Do you want to proceed?', permission: null }))
    expect(await screen.findByText('The permission hook is gone; Dismiss declines the action and interrupts the turn')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
  })

  test('conflict_409_reloads', async () => {
    answerAgentDialog.mockRejectedValue(new ApiError(409, 'permission_resolved', 'resolved'))
    const onClose = vi.fn()
    await mount(permView(), onClose)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow once' }))
    expect(await screen.findByText('The dialog changed; reloaded')).toBeTruthy()
    await waitFor(() => expect(getAgentDialog).toHaveBeenCalledTimes(2))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('get_error_shows_alert', async () => {
    getAgentDialog.mockRejectedValue(new Error('boom'))
    render(
      <ThemeProvider theme={theme}>
        <DialogPanel open agentId={AID} agentLabel="alpha-1" onClose={() => {}} />
      </ThemeProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })
})
