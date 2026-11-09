/** One proposal item: path, chips, current/proposed diff and the reviewer's choice. */
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { lazy, Suspense, type JSX } from 'react'
import type { ProposalItemView, ProposalView } from './api'
import { isStructured, toDoc } from './diffText'

// ValueDiff pulls in CodeMirror: keep it out of the main chunk
const ValueDiff = lazy(() => import('./ValueDiff'))

export type Choice = 'approve' | 'rework' | 'deny'

/**
 * A secret item's `before` is the redacted base declaration, which also carries `set` and `version`;
 * the proposed one never does, so those keys are dropped for display instead of reading as removed.
 */
function displayBefore(item: ProposalItemView): unknown {
  if (item.secret === null || typeof item.before !== 'object' || item.before === null || Array.isArray(item.before)) return item.before
  return Object.fromEntries(Object.entries(item.before).filter(([k]) => k !== 'set' && k !== 'version'))
}

/** Narrow screens: the diff's text as two stacked labeled blocks (the stacked MergeView collapses to zero height there). */
function TextStack({ before, after }: { before: string; after: string }): JSX.Element {
  const block = (label: string, text: string, testId: string): JSX.Element => (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box
        data-testid={testId}
        sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflowY: 'auto', p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
      >
        {text === '' ? <em>(empty)</em> : text}
      </Box>
    </Box>
  )
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {block('Current', before, 'stack-before')}
      {block('Proposed', after, 'stack-after')}
    </Box>
  )
}

export interface ItemCardProps {
  item: ProposalItemView
  /** The proposal kind: a schedule's `prompt` is diffed as text. */
  kind?: ProposalView['kind']
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

export function ItemCard({ item, kind, choice, note, readOnly, stale, changed, previous, onChoice, onNote }: ItemCardProps): JSX.Element {
  const narrow = useMediaQuery(useTheme().breakpoints.down('md'))
  const isPrompt = kind === 'schedule' && item.path === 'prompt'
  const before = displayBefore(item)
  // secret items keep the diff: they only ever say set or changed
  const stacked = narrow && item.secret === null && (isPrompt || isStructured(before) || isStructured(item.after))
  return (
    <Paper variant="outlined" data-testid="item-card" data-path={item.path} sx={{ p: 2, ...(item.grant && { borderColor: 'warning.main', borderWidth: 2 }), display: 'flex', flexDirection: 'column', gap: 1 }}>
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
      {!stacked && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Current
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
            Proposed
          </Typography>
        </Box>
      )}
      {stacked ? (
        <TextStack before={toDoc(before, isPrompt)} after={toDoc(item.after, isPrompt)} />
      ) : (
        <Suspense fallback={<Skeleton variant="rectangular" height={80} />}>
          <ValueDiff before={before} after={item.after} text={isPrompt} />
        </Suspense>
      )}
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
