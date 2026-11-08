/** Collapsible list of earlier revisions: reason, outcome and every item's verdict and note. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import { useState, type JSX } from 'react'
import type { ProposalRevisionView } from './api'

export function RevisionHistory({ revisions }: { revisions: ProposalRevisionView[] }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (revisions.length === 0) return null
  return (
    <Box>
      <Button size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide' : 'Show'} earlier revisions ({revisions.length})
      </Button>
      <Collapse in={open} unmountOnExit>
        {revisions.map((r) => (
          <Box key={r.revision} sx={{ mt: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
            <Typography variant="subtitle2">
              r{r.revision}
              {r.outcome ? ` - outcome: ${r.outcome}` : ''}
            </Typography>
            <Typography variant="body2">{r.reason}</Typography>
            {r.items.map((i) => (
              <Box key={i.path} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {i.path}
                </Typography>
                <Chip size="small" label={i.decision} />
                {i.note && <Typography variant="caption">{i.note}</Typography>}
              </Box>
            ))}
          </Box>
        ))}
      </Collapse>
    </Box>
  )
}
