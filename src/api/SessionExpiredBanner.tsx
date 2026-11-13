import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import { useSessionExpired } from './session'

/** Shown once any API call answered 401: polls and streams have stopped; a reload signs in again. */
export function SessionExpiredBanner() {
  const expired = useSessionExpired()
  if (!expired) return null
  return (
    <Alert
      severity="warning"
      sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.snackbar, borderRadius: 0 }}
      action={
        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
          Reload
        </Button>
      }
    >
      Session expired - reload to sign in
    </Alert>
  )
}
