// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { theme } from '../theme'
import { SessionIssue } from './SessionIssue'

const session = (summary: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({ id: 's', desired: 'running', status: {}, summary: { bootstrap_failed_agents: 0, attention_agents: 0, ...summary }, ...over }) as unknown as SessionView
const agent = (o: Record<string, unknown> = {}) => ({ id: 'a', gone: false, ...o }) as unknown as AgentView
const wrap = (s: SessionView, agents: AgentView[]) => render(<ThemeProvider theme={theme}><SessionIssue session={s} agents={agents} /></ThemeProvider>)
const getAgentDialog = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), getAgentDialog }))
afterEach(() => {
  cleanup()
  getAgentDialog.mockReset()
})

describe('SessionIssue permission mode', () => {
  test('an unavailable mode shows a warning with the reason', () => {
    wrap(session(), [agent({ permission_mode_state: 'unavailable', permission_mode_reason: 'unavailable for this model' })])
    expect(screen.getByRole('status').textContent).toBe('Auto mode unavailable: unavailable for this model')
  })
  test('nothing is shown when the mode is available', () => {
    wrap(session(), [agent({ permission_mode_state: null })])
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('SessionIssue pending close', () => {
  test('closing is shown as a status line', () => {
    wrap(session({}, { desired: 'active', close_requested_at: '2026-11-02T10:00:00Z', close_reason: 'done' }), [])
    expect(screen.getByRole('status').textContent).toBe('closing when idle: done')
    expect(screen.queryByRole('alert')).toBeNull()
  })
  test('closing is not shown while the session is being discarded', () => {
    wrap(session({}, { desired: 'deleting', close_requested_at: '2026-11-02T10:00:00Z', close_reason: 'done' }), [])
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('SessionIssue dialog panel', () => {
  test('open_from_session_issue', () => {
    getAgentDialog.mockReturnValue(new Promise(() => {}))
    wrap(session(), [agent({ id: 'a7', pod_name: 'alpha-7', attention: { reason: 'permission', since: null } })])
    expect(getAgentDialog).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'open dialog' }))
    expect(getAgentDialog).toHaveBeenCalledWith('a7')
    expect(screen.getByText(/alpha-7/)).toBeTruthy()
  })
  test('the summary count fallback has no button', () => {
    wrap(session({ attention_agents: 2 }), [])
    expect(screen.getByRole('status').textContent).toBe('2 agents waiting for input')
    expect(screen.queryByRole('button', { name: 'open dialog' })).toBeNull()
  })
})
