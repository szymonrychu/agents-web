/** Discovered users with search and allow/deny actions; the API's access view is shown as-is. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError, usePoll } from '../triggers'
import { addRule, listUsers } from './api'
import type { UserView } from './api'
import { AccessChip } from './RoomsTable'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

interface Pending {
  user: UserView
  list: 'allow' | 'deny'
}

/** The rule that matches a user: their Facebook id when known, else the Matrix id. */
const ruleFor = (u: UserView) => (u.facebook_id ? { kind: 'facebook', value: u.facebook_id } : { kind: 'user', value: u.user_id })

const COLUMNS: Column<UserView>[] = [
  { key: 'name', label: 'Name', role: 'primary', render: (u) => u.display_name || '-' },
  { key: 'matrix', label: 'Matrix id', role: 'meta', render: (u) => u.user_id },
  { key: 'facebook', label: 'Facebook id', role: 'meta', render: (u) => u.facebook_id || '-' },
  { key: 'rooms', label: 'Rooms', role: 'meta', render: (u) => u.rooms.length },
  { key: 'access', label: 'Access', role: 'meta', render: (u) => <AccessChip access={u.access} /> },
]

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
      <ResponsiveTable
        rows={users ?? []}
        columns={COLUMNS}
        rowKey={(u) => u.user_id}
        ariaLabel="Users"
        cardLabel={(u) => `User ${u.display_name || u.user_id}`}
        actions={(u) => [
          { label: 'Allow', disabled, onClick: () => setPending({ user: u, list: 'allow' }) },
          { label: 'Deny', color: 'error', disabled, onClick: () => setPending({ user: u, list: 'deny' }) },
        ]}
      />
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
