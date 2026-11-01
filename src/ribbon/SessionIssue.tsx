/** One line naming what needs a person on a session: a bootstrap failure (error) or an agent waiting for input. */
import Box from '@mui/material/Box'
import type { AgentView, SessionView } from '../api/client'
import { TOKENS } from '../theme'
import { sessionIssue } from './sessionStatus'

export function SessionIssue({ session, agents }: { session: SessionView; agents: readonly AgentView[] }) {
  const issue = sessionIssue(session, agents)
  if (issue === null || session.desired === 'deleting') return null
  const failed = issue.kind === 'bootstrap_failure'
  return (
    <Box role={failed ? 'alert' : 'status'} sx={{ fontSize: `${TOKENS.fontSizes.xs / 16}rem`, color: failed ? 'error.main' : TOKENS.attention, pt: 0.5, overflowWrap: 'anywhere' }}>
      {failed ? `Bootstrap failed: ${issue.text}` : issue.text}
    </Box>
  )
}
