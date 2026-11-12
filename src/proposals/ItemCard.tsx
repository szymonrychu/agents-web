/** One proposal item as a GitHub-style file: a header (collapse, path, chips, +N -M, expand context, Viewed), the diff and the reviewer's choice. */
import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import UnfoldMore from '@mui/icons-material/UnfoldMore'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import { lazy, Suspense, useState, type JSX } from 'react'
import type { ProposalItemView, ProposalView } from './api'
import type { DiffCounts } from './diffCounts'
import { docMode, initScriptsDoc } from './diffText'
import { useViewed } from './viewed'
import { MONO_FONT, diffPalette } from '../theme'
import type { EntryView } from '../vault/api'
import { isVaultRef, refText } from '../vault/refs'

// ValueDiff pulls in CodeMirror: keep it out of the main chunk (counts come back through its onCounts)
const ValueDiff = lazy(() => import('./ValueDiff'))

export type Choice = 'approve' | 'rework' | 'deny'

const NO_ENTRIES: ReadonlyMap<string, EntryView> = new Map()
const GRANT_COUNTS: DiffCounts = { added: 1, removed: 0 }

/** A vault reference reads as `vault <entry name> / <ENV>` (refText already supplies `vault <8 chars>` for unknown entries); any other value is unchanged. */
const refDisplay = (v: unknown, entries: ReadonlyMap<string, EntryView>): unknown =>
  isVaultRef(v) ? (entries.has(v.vault) ? `vault ${refText(v, entries)}` : refText(v, entries)) : v

/** A project grant (`projects.<slug>` from absent to true): shown as one added line, since `before` is always null. */
export const isProjectGrant = (item: ProposalItemView): boolean => item.path.startsWith('projects.') && item.before == null && item.after === true

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
  /** Vault entries by id, to name the entry behind a reference. */
  entries?: ReadonlyMap<string, EntryView>
  /** Storage key of this item's Viewed mark (`viewedKey`); no Viewed checkbox without it. */
  viewKey?: string
  onChoice: (c: Choice) => void
  onNote: (n: string) => void
}

export function ItemCard({ item, kind, choice, note, readOnly, stale, changed, previous, entries = NO_ENTRIES, viewKey, onChoice, onNote }: ItemCardProps): JSX.Element {
  const palette = diffPalette[useTheme().palette.mode]
  const [viewed, setViewed] = useViewed(viewKey)
  const [open, setOpen] = useState(!viewed)
  const [expanded, setExpanded] = useState(false)
  const [diffCounts, setCounts] = useState<DiffCounts | null>(null)
  const mode = docMode(kind, item.path)
  const grant = isProjectGrant(item)
  const counts = grant ? GRANT_COUNTS : diffCounts
  const hasRef = isVaultRef(item.before) || isVaultRef(item.after)
  const before = refDisplay(item.before, entries)
  const after = refDisplay(item.after, entries)
  const sections = mode === 'init_scripts'
  const markViewed = (v: boolean) => {
    setViewed(v)
    setOpen(!v)
  }
  return (
    <Paper variant="outlined" data-testid="item-card" data-path={item.path} sx={{ overflow: 'hidden', ...(item.grant && { borderColor: 'warning.main', borderWidth: 2 }) }}>
      <Box
        data-testid="item-header"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1, py: 0.5, bgcolor: 'background.default', borderBottom: open ? 1 : 0, borderColor: 'divider' }}
      >
        <IconButton size="small" aria-label={`${open ? 'Collapse' : 'Expand'} ${item.path}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
        </IconButton>
        <Typography component="span" sx={{ fontFamily: MONO_FONT, overflowWrap: 'anywhere' }}>
          {item.path}
        </Typography>
        {item.grant && <Chip size="small" color="warning" label="grant" />}
        {item.security && <Chip size="small" color="warning" variant="outlined" label="security" />}
        {hasRef && <Chip size="small" label="vault" />}
        {changed && previous !== undefined && <Chip size="small" color="info" variant="outlined" label={`changed since r${previous}`} />}
        {!open && !readOnly && choice === undefined && <Chip size="small" label="pending" />}
        {counts && (
          <Typography component="span" variant="body2" sx={{ fontFamily: MONO_FONT, display: 'flex', gap: 0.5 }}>
            <Box component="span" data-testid="count-added" sx={{ color: palette.addedMarker }}>{`+${counts.added}`}</Box>
            <Box component="span" data-testid="count-removed" sx={{ color: palette.removedMarker }}>{`-${counts.removed}`}</Box>
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {!grant && (
          <IconButton size="small" aria-label={`Show all lines of ${item.path}`} aria-pressed={expanded} onClick={() => setExpanded((e) => !e)}>
            <UnfoldMore fontSize="small" />
          </IconButton>
        )}
        {viewKey !== undefined && (
          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Checkbox size="small" checked={viewed} onChange={(e) => markViewed(e.target.checked)} />}
            label={<Typography variant="body2">Viewed</Typography>}
          />
        )}
      </Box>
      {/* no unmountOnExit: the lazy diff mounts while collapsed, so a viewed item still reports its counts */}
      <Collapse in={open}>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {grant ? (
            <Box data-testid="grant-line" sx={{ fontFamily: MONO_FONT, bgcolor: palette.addedLine, color: palette.addedMarker, px: 1, py: 0.5 }}>
              {`+ ${item.path}`}
            </Box>
          ) : (
            <Suspense fallback={<Skeleton variant="rectangular" height={80} />}>
              <ValueDiff
                before={sections ? initScriptsDoc(before) : before}
                after={sections ? initScriptsDoc(after) : after}
                text={mode !== 'yaml'}
                expanded={expanded}
                onCounts={setCounts}
              />
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
        </Box>
      </Collapse>
    </Paper>
  )
}
