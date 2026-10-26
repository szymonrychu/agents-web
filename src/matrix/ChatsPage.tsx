/** Chats: the connector's bot status and every discovered room, refreshed live. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { listPresets } from '../api/client'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { getMeta, listRooms } from './api'
import { ALL, RoomsTable } from './RoomsTable'
import { RoomDrawer } from './RoomDrawer'

export interface ChatsPageProps {
  onBack: () => void
  onOpenSession: (sessionId: string) => void
}

export function ChatsPage({ onBack, onOpenSession }: ChatsPageProps) {
  const [kind, setKind] = useState(ALL)
  const [access, setAccess] = useState(ALL)
  const [selected, setSelected] = useState<string | null>(null)
  const [presetNames, setPresetNames] = useState<Record<string, string>>({})

  const { data: meta, error: metaError } = usePoll(getMeta, 5000, [])
  const { data: rooms, error, refresh } = usePoll(() => listRooms({ kind: kind || undefined, access: access || undefined }), 5000, [kind, access])

  useEffect(() => {
    listPresets().then((list) => setPresetNames(Object.fromEntries(list.map((p) => [p.id, p.name]))), () => setPresetNames({}))
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Chats</Typography>
        {meta && <Typography color="text.secondary">{meta.user_id}</Typography>}
      </Box>
      {meta && !meta.sync.healthy && (
        <Alert severity="warning">
          Matrix sync is unhealthy{meta.sync.last_sync_at ? `; last sync ${new Date(meta.sync.last_sync_at).toLocaleString()}` : ''}.
        </Alert>
      )}
      <FormError error={metaError} />
      <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md }}>Rooms</Typography>
        <FormError error={error} />
        <RoomsTable
          rooms={rooms ?? []}
          kind={kind}
          access={access}
          presetNames={presetNames}
          onKind={setKind}
          onAccess={setAccess}
          onSelect={(r) => setSelected(r.room_id)}
          onOpenSession={onOpenSession}
        />
        {rooms && rooms.length === 0 && <Typography color="text.secondary">No rooms discovered yet.</Typography>}
      </Box>
      <RoomDrawer roomId={selected} onClose={() => setSelected(null)} onChanged={() => void refresh()} />
    </Box>
  )
}
