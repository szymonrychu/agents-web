/** One-time credentials of a created, rotated, cloned or re-moded endpoint; the parent drops the endpoint (and the secret) on close. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import type { EndpointCreated } from './api'
import { setupHint } from './authPresets'
import { CopyButton } from './copy'

export interface CredentialsDialogProps {
  endpoint: EndpointCreated | null
  onClose: () => void
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
  const basic = endpoint?.auth_mode === 'basic'
  const withHeader = endpoint?.auth_mode === 'header' || endpoint?.auth_mode === 'hmac'
  return (
    <Dialog open={endpoint !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Endpoint credentials</DialogTitle>
      {endpoint && (
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography color="warning.main">
            {basic
              ? 'The password is shown only now. Rotate the credentials to get a new one.'
              : 'The secret is shown only now. Rotate the secret to get a new one.'}
          </Typography>
          <Row label="URL" value={endpoint.url} mono />
          {basic ? (
            <>
              <Row label="Username" value={endpoint.username ?? ''} mono />
              <Row label="Password" value={endpoint.password ?? ''} mono />
            </>
          ) : (
            <>
              {withHeader && <Row label="Header" value={endpoint.auth_header ?? ''} mono />}
              <Row label="Secret" value={endpoint.secret ?? ''} mono />
            </>
          )}
          <Typography variant="body2" color="text.secondary">{setupHint(endpoint)}</Typography>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
