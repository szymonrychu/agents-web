/** Settings > History: placeholder; the search UI replaces it. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'

export interface HistoryPageProps {
  onBack: () => void
}

export function HistoryPage({ onBack }: HistoryPageProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button onClick={onBack}>Back</Button>
      <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>History</Typography>
    </Box>
  )
}
