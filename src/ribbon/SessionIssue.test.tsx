// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { AgentView, SessionView } from '../api/client'
import { theme } from '../theme'
import { SessionIssue } from './SessionIssue'

const session = (summary: Record<string, unknown> = {}) => ({ id: 's', desired: 'running', status: {}, summary: { bootstrap_failed_agents: 0, attention_agents: 0, ...summary } }) as unknown as SessionView
const agent = (o: Record<string, unknown> = {}) => ({ id: 'a', gone: false, ...o }) as unknown as AgentView
const wrap = (s: SessionView, agents: AgentView[]) => render(<ThemeProvider theme={theme}><SessionIssue session={s} agents={agents} /></ThemeProvider>)
afterEach(cleanup)

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
