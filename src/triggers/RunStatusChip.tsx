import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'

export type RunStatus = 'new' | 'in-progress' | 'handled' | 'ignored' | 'failed'

const STYLE: Record<RunStatus, { color: 'default' | 'info' | 'success' | 'error'; outlined?: boolean }> = {
  new: { color: 'default' },
  'in-progress': { color: 'info' },
  handled: { color: 'success' },
  ignored: { color: 'default', outlined: true },
  failed: { color: 'error' },
}

export interface RunStatusChipProps {
  status: RunStatus
  reason?: string
}

/** One chip per run status; the reason is the tooltip and part of the aria-label. */
export function RunStatusChip({ status, reason }: RunStatusChipProps) {
  const { color, outlined } = STYLE[status]
  const label = reason ? `${status}: ${reason}` : status
  const chip = (
    <Chip
      size="small"
      label={status}
      color={color}
      variant={outlined ? 'outlined' : 'filled'}
      icon={status === 'in-progress' ? <CircularProgress size={12} color="inherit" /> : undefined}
      aria-label={label}
    />
  )
  return reason ? <Tooltip title={reason}>{chip}</Tooltip> : chip
}
