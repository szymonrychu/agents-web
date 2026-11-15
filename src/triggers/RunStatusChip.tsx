import { useState } from 'react'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTouchOrSmall } from '../layout/useLayout'
import { TOKENS } from '../theme'

/** Run and inbound statuses, plus `pending` and `sent` of the matrix connector's outbound replies. */
export type RunStatus = 'new' | 'in-progress' | 'handled' | 'ignored' | 'failed' | 'pending' | 'sent'

type Style = { color: 'default' | 'info' | 'success' | 'error'; outlined?: boolean }

const STYLE: Record<RunStatus, Style> = {
  new: { color: 'default' },
  'in-progress': { color: 'info' },
  handled: { color: 'success' },
  ignored: { color: 'default', outlined: true },
  failed: { color: 'error' },
  pending: { color: 'default' },
  sent: { color: 'success' },
}

export interface RunStatusChipProps {
  status: RunStatus
  reason?: string
}

/** One chip per run status; the reason is the tooltip (a tap popover on touch) and part of the aria-label. A status the
 * backend adds later renders as a plain chip, never an exception that blanks the page. */
export function RunStatusChip({ status, reason }: RunStatusChipProps) {
  const { color, outlined }: Style = STYLE[status] ?? { color: 'default' }
  const label = reason ? `${status}: ${reason}` : status
  const touch = useTouchOrSmall()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const tappable = touch && Boolean(reason)
  const chip = (
    <Chip
      size="small"
      label={status}
      color={color}
      variant={outlined ? 'outlined' : 'filled'}
      icon={status === 'in-progress' ? <CircularProgress size={12} color="inherit" /> : undefined}
      aria-label={label}
      onClick={tappable ? (e) => setAnchor(e.currentTarget) : undefined}
    />
  )
  if (!reason) return chip
  if (!tappable) return <Tooltip title={reason}>{chip}</Tooltip>
  return (
    <>
      {chip}
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Typography data-testid="run-reason" sx={{ p: 1, maxWidth: 280, fontSize: `${TOKENS.fontSizes.sm / 16}rem`, overflowWrap: 'anywhere' }}>
          {reason}
        </Typography>
      </Popover>
    </>
  )
}
