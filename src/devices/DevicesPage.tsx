/** Devices: pair a sketch device with a 6-digit code typed on the tablet, and list or revoke devices. */
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { listDevices, pairDevice, regenerateCode, revokeDevice } from './api'
import type { DeviceView, NewCode } from './api'
import { PairingCode } from './PairingCode'

const POLL_MS = 15_000
const CODE_POLL_MS = 3_000

const STATE_LABEL = { pending: 'Waiting for code', active: 'Active' } as const

/** The code on screen: only ever held in component state. */
interface Shown extends NewCode {
  device_id: string
  name: string
}

/** Words for the failures an operator can act on; anything else keeps its own message. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) {
    return 'Forbidden (403): the admin API refused this request. Check that your SSO session is valid and that you are on an allowed network.'
  }
  if (e instanceof ApiError && e.status === 401) return 'Not signed in (401): reload the page to sign in again.'
  if (e instanceof TypeError) return `Network error: the admin API could not be reached (${e.message}).`
  return e instanceof Error ? e.message : String(e)
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export interface DevicesPageProps {
  onBack: () => void
}

export function DevicesPage({ onBack }: DevicesPageProps) {
  const [shown, setShown] = useState<Shown | null>(null)
  const [pairedName, setPairedName] = useState<string | null>(null)
  const { data, error, refresh } = usePoll(listDevices, shown ? CODE_POLL_MS : POLL_MS, [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<DeviceView | null>(null)

  // The device row turning active means the tablet redeemed the code: switch to Paired and drop the code.
  const activated = shown ? data?.find((d) => d.device_id === shown.device_id && d.state === 'active') : undefined
  if (shown && activated) {
    setPairedName(activated.name)
    setShown(null)
  }

  const pair = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setBusy(true)
    setActionError(null)
    try {
      const { device_id, name: deviceName, code, expires_at, expires_in } = await pairDevice(trimmed)
      setPairedName(null)
      setShown({ device_id, name: deviceName, code, expires_at, expires_in })
      setName('')
    } catch (e) {
      setActionError(describeError(e))
      setBusy(false)
      return
    }
    setBusy(false)
    // The pairing succeeded: a list refresh failure surfaces through the poll error, not as a pair error.
    await refresh().catch(() => {})
  }

  const newCode = async () => {
    if (!shown) return
    setBusy(true)
    setActionError(null)
    try {
      const { code, expires_at, expires_in } = await regenerateCode(shown.device_id)
      setShown({ ...shown, code, expires_at, expires_in })
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 404 ? `${shown.name} was revoked or no longer exists.` : describeError(e))
    }
    setBusy(false)
    await refresh().catch(() => {})
  }

  const revoke = async () => {
    const d = revoking
    setRevoking(null)
    if (!d) return
    setActionError(null)
    try {
      await revokeDevice(d.device_id)
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 404 ? `${d.name} was already revoked or no longer exists.` : describeError(e))
    }
    await refresh().catch(() => {})
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Devices</Typography>
      </Box>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault()
          void pair()
        }}
        sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
      >
        <TextField size="small" label="Device name" value={name} slotProps={{ htmlInput: { maxLength: 80 } }} onChange={(e) => setName(e.target.value)} sx={{ maxWidth: 320 }} />
        <Button type="submit" variant="contained" disabled={busy || name.trim() === ''}>Pair</Button>
      </Box>
      <FormError error={actionError} />
      <FormError error={error ? describeError(error) : null} />
      {shown && (
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => setShown(null)}>Done</Button>}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography>
              On the tablet, enter the server origin and type this code to pair {shown.name}.
            </Typography>
            <PairingCode
              code={shown.code}
              expiresIn={shown.expires_in}
              locked={data?.find((d) => d.device_id === shown.device_id)?.code_status === 'locked'}
              busy={busy}
              onNewCode={() => void newCode()}
            />
            <TextField size="small" fullWidth label="Server origin" value={window.location.origin} slotProps={{ input: { readOnly: true } }} />
          </Box>
        </Alert>
      )}
      {pairedName && (
        <Alert severity="success" action={<Button color="inherit" size="small" onClick={() => setPairedName(null)}>Done</Button>}>
          {pairedName} is paired.
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>{['Name', 'Plugin', 'Created', 'State', 'Actions'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {(data ?? []).map((d) => (
            <TableRow key={d.device_id}>
              <TableCell>{d.name}</TableCell>
              <TableCell>{d.plugin}</TableCell>
              <TableCell>{when(d.created_at)}</TableCell>
              <TableCell>{d.revoked_at ? `Revoked ${when(d.revoked_at)}` : STATE_LABEL[d.state as keyof typeof STATE_LABEL] ?? d.state}</TableCell>
              <TableCell>
                {!d.revoked_at && <Button size="small" color="error" onClick={() => setRevoking(d)}>Revoke</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data && data.length === 0 && <Typography color="text.secondary">No devices paired yet.</Typography>}
      <ConfirmDialog
        open={revoking !== null}
        title={`Revoke ${revoking?.name ?? ''}?`}
        body="The device's token stops working and its open event streams end. This cannot be undone."
        confirmLabel="Revoke"
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </Box>
  )
}
