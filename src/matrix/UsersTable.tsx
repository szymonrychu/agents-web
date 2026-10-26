/** Discovered users with search and allow/deny actions; the API's access view is shown as-is. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError, usePoll } from '../triggers'
import { addRule, listUsers } from './api'
import type { UserView } from './api'
import { AccessChip } from './RoomsTable'

interface Pending {
  user: UserView
  list: 'allow' | 'deny'
}

/** The rule that matches a user: their Facebook id when known, else the Matrix id. */
const ruleFor = (u: UserView) => (u.facebook_id ? { kind: 'facebook', value: u.facebook_id } : { kind: 'user', value: u.user_id })

export function UsersTable() {
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<Error>()
  const { data: users, error: loadError, refresh } = usePoll(() => listUsers({ q: q || undefined }), 5000, [q])

  const confirm = async () => {
    const p = pending
    setPending(null)
    if (!p) return
    setError(undefined)
    try {
      await addRule({ list: p.list, ...ruleFor(p.user) })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  const disabled = loadError !== undefined && loadError !== null
  const verb = pending?.list === 'allow' ? 'Allow' : 'Deny'
  const target = pending ? ruleFor(pending.user) : undefined

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField size="small" label="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 320 }} />
      <FormError error={loadError ?? error} />
      <Table size="small">
        <TableHead>
          <TableRow>{['Name', 'Matrix id', 'Facebook id', 'Rooms', 'Access', 'Actions'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {(users ?? []).map((u) => (
            <TableRow key={u.user_id}>
              <TableCell>{u.display_name}</TableCell>
              <TableCell>{u.user_id}</TableCell>
              <TableCell>{u.facebook_id}</TableCell>
              <TableCell>{u.rooms.length}</TableCell>
              <TableCell><AccessChip access={u.access} /></TableCell>
              <TableCell>
                <Button size="small" disabled={disabled} onClick={() => setPending({ user: u, list: 'allow' })}>Allow</Button>
                <Button size="small" color="error" disabled={disabled} onClick={() => setPending({ user: u, list: 'deny' })}>Deny</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {users && users.length === 0 && <Typography color="text.secondary">No users found.</Typography>}
      <ConfirmDialog
        open={pending !== null}
        title={`${verb} ${pending?.user.display_name ?? pending?.user.user_id ?? ''}?`}
        body={target ? `Adds a ${pending?.list} rule of kind ${target.kind} with value ${target.value}.` : undefined}
        confirmLabel={verb}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
