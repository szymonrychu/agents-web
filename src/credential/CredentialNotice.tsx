/** One line above the chat when the Claude credential nears or passes its end date. */
import Box from '@mui/material/Box'
import { useNow } from '../chat/agentAge'
import { TOKENS } from '../theme'
import { credentialLine, useCredential } from './credential'

export function CredentialNotice() {
  const credential = useCredential()
  const now = useNow()
  const line = credentialLine(credential, now)
  if (line === null) return null
  return (
    <Box role={line.severity === 'error' ? 'alert' : 'status'} sx={{ fontSize: `${TOKENS.fontSizes.xs / 16}rem`, color: line.severity === 'error' ? 'error.main' : 'warning.main', pt: 0.5, overflowWrap: 'anywhere' }}>
      {line.text}
    </Box>
  )
}
