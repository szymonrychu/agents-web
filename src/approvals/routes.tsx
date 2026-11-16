import Box from '@mui/material/Box'
import { safeArea } from '../layout/safeArea'
import { ApprovalsPage } from './ApprovalsPage'

/** Mounted at `/approvals`. */
export function ApprovalsRoute() {
  return (
    <Box data-testid="approvals-route" sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, p: 2, ...safeArea(['top', 'right', 'bottom', 'left'], 16) }}>
      <ApprovalsPage />
    </Box>
  )
}
