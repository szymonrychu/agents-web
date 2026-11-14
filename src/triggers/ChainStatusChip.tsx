import Chip from '@mui/material/Chip'

const COLOR: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  pending: 'info',
  fired: 'success',
  skipped: 'default',
  expired: 'warning',
}

/** The chain status of a source run or webhook event (pending, fired, skipped, expired); nothing without one. */
export function ChainStatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return null
  return <Chip size="small" variant="outlined" color={COLOR[status] ?? 'default'} label={status} aria-label={`chain ${status}`} />
}
