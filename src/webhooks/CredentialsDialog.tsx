/** One-time credentials of a created or rotated endpoint; the parent drops the endpoint (and the password) on close. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import type { EndpointCreated } from './api'
import { CopyButton } from './copy'

export interface CredentialsDialogProps {
  endpoint: EndpointCreated | null
  onClose: () => void
}

function hint(type: string): string {
  if (type === 'grafana-alert') {
    return 'In Grafana, add a webhook contact point with this URL and enter the username and password in its basic auth fields.'
  }
  return 'Use https://<user>:<password>@<host>/webhook/<suffix> as the webhook URL in GitHub or GitLab (user and password from below).'
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ width: 90 }} color="text.secondary">{label}</Typography>
      <Typography sx={{ flexGrow: 1, wordBreak: 'break-all', fontFamily: mono ? 'monospace' : undefined }}>{value}</Typography>
      <CopyButton label={`Copy ${label.toLowerCase()}`} value={value} />
    </Box>
  )
}

export function CredentialsDialog({ endpoint, onClose }: CredentialsDialogProps) {
  return (
    <Dialog open={endpoint !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Endpoint credentials</DialogTitle>
      {endpoint && (
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography color="warning.main">The password is shown only now. Rotate the credentials to get a new one.</Typography>
          <Row label="URL" value={endpoint.url} mono />
          <Row label="Username" value={endpoint.username} mono />
          <Row label="Password" value={endpoint.password} mono />
          <Typography variant="body2" color="text.secondary">{hint(endpoint.type)}</Typography>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
