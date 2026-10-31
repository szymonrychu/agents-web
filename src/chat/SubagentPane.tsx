/** Read-only, collapsible preview of one Claude subagent's operations (text, thinking, tools, denials). */
import { useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { TOKENS } from '../theme'
import type { ChatItem, SubagentPaneData, SubagentSplit } from './chatModel'

/** What ChatEntry needs to place panes: the split without its main list. */
export type SubagentIndex = Pick<SubagentSplit, 'panes' | 'byToolUse'>

const operations = (n: number): string => `${n} ${n === 1 ? 'operation' : 'operations'}`

export function SubagentPane({ pane, renderItem }: { pane: SubagentPaneData; renderItem: (item: ChatItem) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const name = `subagent ${pane.agentType ?? pane.claudeAgentId}`
  return (
    <Box role="group" aria-label={name} sx={{ mt: 0.5, borderLeft: `${TOKENS.borderWidth * 2}px solid ${TOKENS.border}`, pl: 1 }}>
      <ButtonBase aria-expanded={open} onClick={() => setOpen((o) => !o)} sx={{ gap: 1, textAlign: 'left', color: 'text.secondary', fontSize: `${TOKENS.fontSizes.sm / 16}rem` }}>
        <span>{name}</span>
        <span>{`${pane.status}, ${operations(pane.items.length)}`}</span>
      </ButtonBase>
      {open ? (
        <Box role="list" aria-label={`${name} operations`} sx={{ mt: 0.5 }}>
          {pane.items.map((item) => (
            <Box key={item.eventId}>{renderItem(item)}</Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
