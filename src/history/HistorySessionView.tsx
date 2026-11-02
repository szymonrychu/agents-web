/** One discarded session's transcript: placeholder until the viewer lands. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import type { SessionSummary } from './api'

export interface HistorySessionViewProps {
  session: SessionSummary
  onBack: () => void
}

export function HistorySessionView({ session, onBack }: HistorySessionViewProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button onClick={onBack}>Back</Button>
      <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>{session.slug}</Typography>
    </Box>
  )
}
