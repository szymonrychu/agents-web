// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { emittedInMedia } from '../test/emittedCss'
import { COARSE, theme } from '../theme'
import type { ChatItem, SubagentPaneData } from './chatModel'
import { ChatEntry } from './entries'
import { SubagentPane } from './SubagentPane'

afterEach(cleanup)


describe('local toggles keep a 44px target on coarse pointers', () => {
  it('the thinking expand toggle', () => {
    const item: ChatItem = { kind: 'thinking', text: 'hmm', collapsed: true, eventId: 1, agentId: 'a', agentOrdinal: 0, ts: '2026-01-01T00:00:00Z' }
    render(
      <ThemeProvider theme={theme}>
        <ChatEntry item={item} />
      </ThemeProvider>,
    )
    const btn = screen.getByRole('button', { name: 'thinking' })
    expect(emittedInMedia(btn, COARSE)).toContain('min-height:44px')
  })

  it('the subagent pane toggle', () => {
    const pane: SubagentPaneData = { claudeAgentId: 'x', agentType: 'Explore', status: 'running', items: [] }
    render(
      <ThemeProvider theme={theme}>
        <SubagentPane pane={pane} renderItem={() => null} />
      </ThemeProvider>,
    )
    const btn = screen.getByRole('button', { expanded: false })
    expect(emittedInMedia(btn, COARSE)).toContain('min-height:44px')
  })
})
