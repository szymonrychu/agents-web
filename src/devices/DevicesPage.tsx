/** Devices: pair a sketch device (token shown once) and list or revoke paired devices. */
import { useEffect, useState } from 'react'
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
import { listDevices, pairDevice, revokeDevice } from './api'
import type { DeviceView, PairedDevice } from './api'

const POLL_MS = 15_000

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
  const { data, error, refresh } = usePoll(listDevices, POLL_MS, [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // The token lives in this component's state only: never storage, logs or the URL.
  const [paired, setPaired] = useState<PairedDevice | null>(null)
  const [revoking, setRevoking] = useState<DeviceView | null>(null)

  useEffect(() => () => setPaired(null), [])

  const pair = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setBusy(true)
    setActionError(null)
    try {
      setPaired(await pairDevice(trimmed))
      setName('')
      await refresh()
    } catch (e) {
      setActionError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const d = revoking
    setRevoking(null)
    if (!d) return
    setActionError(null)
    try {
      await revokeDevice(d.device_id)
      await refresh()
    } catch (e) {
      setActionError(describeError(e))
    }
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
        <TextField size="small" label="Device name" value={name} onChange={(e) => setName(e.target.value)} sx={{ maxWidth: 320 }} />
        <Button type="submit" variant="contained" disabled={busy || name.trim() === ''}>Pair</Button>
      </Box>
      <FormError error={actionError ?? (error ? describeError(error) : null)} />
      {paired && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setPaired(null)}>Done</Button>}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography>
              Device {paired.name} is paired. This token will not be shown again; copy it now and enter it in the app with the server origin.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" fullWidth label="Device token" value={paired.token} slotProps={{ input: { readOnly: true } }} />
              <Button size="small" onClick={() => void navigator.clipboard?.writeText(paired.token)}>Copy token</Button>
            </Box>
            <TextField size="small" fullWidth label="Server origin" value={window.location.origin} slotProps={{ input: { readOnly: true } }} />
          </Box>
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
              <TableCell>{d.revoked_at ? `Revoked ${when(d.revoked_at)}` : 'Active'}</TableCell>
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
