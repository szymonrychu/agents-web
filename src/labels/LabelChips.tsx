import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

export interface LabelChipsProps {
  labels: string[]
  /** When set, each chip is clickable (click-to-filter). */
  onClick?: (label: string) => void
}

export function LabelChips({ labels, onClick }: LabelChipsProps) {
  if (labels.length === 0) return null
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {labels.map((label) => (
        <Chip key={label} size="small" variant="outlined" label={label} onClick={onClick ? () => onClick(label) : undefined} />
      ))}
    </Box>
  )
}
