import { lazy, Suspense, useState, type JSX } from 'react'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Markdown } from '../markdown/Markdown'

// ValueDiff pulls in CodeMirror: keep it out of the main chunk
const ValueDiff = lazy(() => import('../proposals/ValueDiff'))

export interface VersionDiffProps {
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
}

/** Two document bodies as a text diff, with a toggle that shows both rendered side by side. */
export function VersionDiff({ before, after, beforeLabel, afterLabel }: VersionDiffProps): JSX.Element {
  const [mode, setMode] = useState<'diff' | 'rendered'>('diff')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <ToggleButtonGroup exclusive size="small" aria-label="Diff view" value={mode} onChange={(_, v: 'diff' | 'rendered' | null) => v !== null && setMode(v)}>
          <ToggleButton value="diff">Diff</ToggleButton>
          <ToggleButton value="rendered">Rendered</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">{`${beforeLabel} to ${afterLabel}`}</Typography>
      </Box>
      {mode === 'diff' ? (
        <Suspense fallback={<Skeleton variant="rectangular" height={120} />}>
          <ValueDiff key={`${beforeLabel}|${afterLabel}`} before={before} after={after} text labels={[beforeLabel, afterLabel]} />
        </Suspense>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box data-testid="rendered-before" sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{beforeLabel}</Typography>
            <Markdown>{before}</Markdown>
          </Box>
          <Box data-testid="rendered-after" sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{afterLabel}</Typography>
            <Markdown>{after}</Markdown>
          </Box>
        </Box>
      )}
    </Box>
  )
}
