/** A room's recent messages, newest first, polled while mounted. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { FormError, RunStatusChip, usePoll } from '../triggers'
import type { RunStatus } from '../triggers'
import { listRoomMessages } from './api'
import type { MessageView } from './api'

const PAGE = 50

export function RoomMessages({ roomId }: { roomId: string }) {
  const [older, setOlder] = useState<MessageView[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [olderError, setOlderError] = useState<Error>()
  const { data, error } = usePoll(() => listRoomMessages(roomId, { limit: PAGE }), 5000, [roomId])

  const head = data ?? []
  const seen = new Set(head.map((m) => m.id))
  const messages = [...head, ...older.filter((m) => !seen.has(m.id))]
  const canLoadMore = !exhausted && (older.length > 0 || head.length >= PAGE)

  const loadOlder = async () => {
    const last = messages[messages.length - 1]
    if (!last) return
    try {
      const page = await listRoomMessages(roomId, { limit: PAGE, beforeId: last.id })
      setOlder((o) => [...o, ...page])
      if (page.length < PAGE) setExhausted(true)
    } catch (e) {
      setOlderError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="h3" variant="subtitle1">Recent messages</Typography>
      <FormError error={error ?? olderError} />
      {data && messages.length === 0 ? (
        <Typography color="text.secondary">No messages yet.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Dir', 'Time', 'Sender', 'Body', 'Status'].map((h) => <TableCell key={h}>{h}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {messages.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.direction === 'in' ? 'in' : 'out'}</TableCell>
                <TableCell>{new Date(m.at).toLocaleString()}</TableCell>
                <TableCell>{m.sender_name ?? m.sender}</TableCell>
                <TableCell>{m.body ?? <i>not stored</i>}</TableCell>
                <TableCell><RunStatusChip status={m.status as RunStatus} reason={m.reason ?? undefined} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canLoadMore && <Button onClick={() => void loadOlder()} sx={{ alignSelf: 'flex-start' }}>Load older</Button>}
    </Box>
  )
}
