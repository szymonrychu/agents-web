/** Endpoints table: URL, type, preset name, username, times; rotate and delete behind a confirm. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { listPresets } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError } from '../triggers'
import { deleteEndpoint, listEndpoints, rotateEndpoint } from './api'
import type { EndpointCreated, EndpointView } from './api'
import { CopyButton } from './copy'
import { CredentialsDialog } from './CredentialsDialog'

export interface EndpointsListProps {
  refreshKey: number
  onChanged: () => void
  onCreate?: () => void
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '-')

export function EndpointsList({ refreshKey, onChanged, onCreate }: EndpointsListProps) {
  const [endpoints, setEndpoints] = useState<EndpointView[] | null>(null)
  const [presetNames, setPresetNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [rotating, setRotating] = useState<EndpointView | null>(null)
  const [deleting, setDeleting] = useState<EndpointView | null>(null)
  const [credentials, setCredentials] = useState<EndpointCreated | null>(null)

  useEffect(() => {
    listPresets().then((ps) => setPresetNames(Object.fromEntries(ps.map((p) => [p.id, p.name]))), () => {})
  }, [])
  useEffect(() => {
    let cancelled = false
    listEndpoints().then(
      (list) => !cancelled && setEndpoints(list),
      (e: unknown) => !cancelled && setError(e),
    )
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const rotate = async () => {
    const target = rotating
    setRotating(null)
    if (!target) return
    try {
      setCredentials(await rotateEndpoint(String(target.id)))
      onChanged()
    } catch (e) {
      setError(e)
    }
  }
  const remove = async () => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    try {
      await deleteEndpoint(String(target.id))
      onChanged()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormError error={error as never} />
      {endpoints && endpoints.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography color="text.secondary">No endpoints yet</Typography>
          {onCreate && <Button variant="outlined" onClick={onCreate}>New endpoint</Button>}
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>URL</TableCell><TableCell>Type</TableCell><TableCell>Preset</TableCell><TableCell>Username</TableCell>
              <TableCell>Created</TableCell><TableCell>Rotated</TableCell><TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(endpoints ?? []).map((ep) => (
              <TableRow key={ep.id}>
                <TableCell sx={{ wordBreak: 'break-all' }}>
                  <span>{ep.url}</span> <CopyButton label="Copy URL" value={ep.url} />
                </TableCell>
                <TableCell>{ep.type}</TableCell>
                <TableCell>{presetNames[ep.preset_id] ?? ep.preset_id}</TableCell>
                <TableCell>{ep.username}</TableCell>
                <TableCell>{when(ep.created_at)}</TableCell>
                <TableCell>{when(ep.credentials_rotated_at)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setRotating(ep)}>Rotate credentials</Button>
                  <Button size="small" color="error" onClick={() => setDeleting(ep)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ConfirmDialog
        open={rotating !== null} title="Rotate credentials?" confirmLabel="Rotate"
        body={rotating ? `A new password is issued for ${rotating.url}; the old one stops working at once.` : undefined}
        onConfirm={() => void rotate()} onCancel={() => setRotating(null)}
      />
      <ConfirmDialog
        open={deleting !== null} title="Delete endpoint?" confirmLabel="Delete"
        body={deleting ? `${deleting.url} stops accepting events.` : undefined}
        onConfirm={() => void remove()} onCancel={() => setDeleting(null)}
      />
      <CredentialsDialog endpoint={credentials} onClose={() => setCredentials(null)} />
    </Box>
  )
}
