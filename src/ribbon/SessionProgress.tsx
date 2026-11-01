/** Progress bar of a session being prepared or discarded; renders nothing otherwise. */
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import type { SessionView } from '../api/client'
import { TOKENS } from '../theme'
import { preparingProgress } from './sessionStatus'

export interface SessionProgressProps {
  session: SessionView
  /** Also print the label under the bar. */
  showLabel?: boolean
}

export function SessionProgress({ session, showLabel = false }: SessionProgressProps) {
  const progress = preparingProgress(session)
  if (progress === null) return null
  const name = `${progress.kind === 'discarding' ? 'Discarding' : 'Preparing'} ${session.slug}`
  return (
    <Box sx={{ width: '100%' }}>
      <LinearProgress
        variant={progress.value === null ? 'indeterminate' : 'determinate'}
        value={progress.value ?? undefined}
        aria-label={name}
        sx={{ height: 2, bgcolor: TOKENS.border, '& .MuiLinearProgress-bar': { bgcolor: progress.kind === 'discarding' ? TOKENS.textDisabled : TOKENS.warning } }}
      />
      {showLabel && (
        <Box sx={{ fontSize: `${TOKENS.fontSizes.xs / 16}rem`, color: 'text.secondary', pt: 0.5 }}>{`${name}: ${progress.label}`}</Box>
      )}
    </Box>
  )
}
