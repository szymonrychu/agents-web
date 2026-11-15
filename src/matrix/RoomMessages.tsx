/** A room's recent messages, newest first, polled while mounted. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { FormError, RunStatusChip, usePoll } from '../triggers'
import type { RunStatus } from '../triggers'
import { listRoomMessages } from './api'
import type { MessageView } from './api'
import { mediaChipText } from './media'
import { DateTime } from '../common/DateTime'
import { formatDateTime } from '../common/dates'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

const PAGE = 50

const COLUMNS: Column<MessageView>[] = [
  { key: 'dir', label: 'Dir', role: 'meta', render: (m) => (m.direction === 'in' ? 'in' : 'out') },
  { key: 'time', label: 'Time', role: 'primary', render: (m) => <DateTime iso={m.at} /> },
  { key: 'sender', label: 'Sender', role: 'meta', render: (m) => m.sender_name ?? m.sender ?? '-' },
  { key: 'body', label: 'Body', role: 'secondary', render: (m) => <MessageBody m={m} /> },
  { key: 'status', label: 'Status', role: 'meta', render: (m) => <RunStatusChip status={m.status as RunStatus} reason={m.reason ?? undefined} /> },
]

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
        <ResponsiveTable
          rows={messages}
          columns={COLUMNS}
          rowKey={(m) => String(m.id)}
          ariaLabel="Messages"
          cardLabel={(m) => `Message ${formatDateTime(m.at)}`}
        />
      )}
      {canLoadMore && <Button onClick={() => void loadOlder()} sx={{ alignSelf: 'flex-start' }}>Load older</Button>}
    </Box>
  )
}

function MessageBody({ m }: { m: MessageView }) {
  const chip = mediaChipText(m)
  if (!chip) return <>{m.body ?? <i>not stored</i>}</>
  return (
    <>
      {m.body}
      <Chip size="small" variant="outlined" label={chip} color={m.media_status === 'not_attached' ? 'warning' : 'default'} sx={{ display: 'flex', width: 'fit-content', mt: m.body ? 0.5 : 0 }} />
    </>
  )
}
