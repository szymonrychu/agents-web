/** One proposal item: path, chips, current/proposed diff and the reviewer's choice. */
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, type JSX } from 'react'
import type { ProposalItemView } from './api'

// ValueDiff pulls in CodeMirror: keep it out of the main chunk
const ValueDiff = lazy(() => import('./ValueDiff'))

export type Choice = 'approve' | 'rework' | 'deny'

export interface ItemCardProps {
  item: ProposalItemView
  choice: Choice | undefined
  note: string
  readOnly: boolean
  stale: boolean
  /** The proposed value differs from revision `previous`. */
  changed: boolean
  previous?: number
  onChoice: (c: Choice) => void
  onNote: (n: string) => void
}

export function ItemCard({ item, choice, note, readOnly, stale, changed, previous, onChoice, onNote }: ItemCardProps): JSX.Element {
  return (
    <Paper variant="outlined" data-testid="item-card" data-path={item.path} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="span" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
          {item.path}
        </Typography>
        {item.grant && <Chip size="small" color="warning" label="grant" />}
        {item.security && <Chip size="small" color="warning" variant="outlined" label="security" />}
        {item.secret !== null && <Chip size="small" label="secret" />}
        {changed && previous !== undefined && <Chip size="small" color="info" variant="outlined" label={`changed since r${previous}`} />}
      </Box>
      {item.secret !== null && <Typography variant="body2">{item.secret === 'set' ? 'value set' : 'value changed'}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Current
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          Proposed
        </Typography>
      </Box>
      <Suspense fallback={<Skeleton variant="rectangular" height={80} />}>
        <ValueDiff before={item.before} after={item.after} />
      </Suspense>
      {readOnly ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" label={item.decision} />
          {item.note && <Typography variant="body2">{item.note}</Typography>}
        </Box>
      ) : (
        <>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={choice ?? null}
            onChange={(_, v: Choice | null) => v && onChoice(v)}
            aria-label={`Decision for ${item.path}`}
          >
            {!stale && <ToggleButton value="approve">Approve</ToggleButton>}
            <ToggleButton value="rework">Rework</ToggleButton>
            <ToggleButton value="deny">Deny</ToggleButton>
          </ToggleButtonGroup>
          {(choice === 'rework' || choice === 'deny') && (
            <TextField
              size="small"
              multiline
              required={choice === 'rework'}
              label={choice === 'rework' ? 'What to change' : 'Note (optional)'}
              value={note}
              onChange={(e) => onNote(e.target.value)}
            />
          )}
        </>
      )}
    </Paper>
  )
}
