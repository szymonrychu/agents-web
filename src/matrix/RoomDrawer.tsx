/** One room: members, preset and trigger settings, allow/deny rule actions and recent messages. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError, PresetSelect } from '../triggers'
import { addRule, deleteRule, getRoom, listRules, setRoomSettings } from './api'
import type { RoomDetail, RuleView } from './api'
import { RoomMessages } from './RoomMessages'
import { AccessChip } from './RoomsTable'

type Pending = 'allow' | 'deny' | 'remove'

export interface RoomDrawerProps {
  roomId: string | null
  onClose: () => void
  onChanged: () => void
}

export function RoomDrawer({ roomId, onClose, onChanged }: RoomDrawerProps) {
  return (
    <Drawer anchor="right" open={roomId !== null} onClose={onClose} slotProps={{ paper: { role: 'dialog', 'aria-label': 'Room details', sx: { width: { xs: '100%', md: 640 }, p: 2 } } }}>
      {roomId && <RoomPanel key={roomId} roomId={roomId} onChanged={onChanged} />}
    </Drawer>
  )
}

function RoomPanel({ roomId, onChanged }: { roomId: string; onChanged: () => void }) {
  const [room, setRoom] = useState<RoomDetail>()
  const [rule, setRule] = useState<RuleView>()
  const [preset, setPreset] = useState('')
  const [trigger, setTrigger] = useState('')
  const [error, setError] = useState<Error>()
  const [pending, setPending] = useState<Pending | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getRoom(roomId).then((r) => {
      if (cancelled) return
      setRoom(r)
      setPreset(r.preset_id ?? '')
      setTrigger(r.trigger ?? '')
    }, (e: unknown) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
    return () => { cancelled = true }
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    listRules().then((rules) => {
      if (!cancelled) setRule([...rules.allow, ...rules.deny].find((r) => r.kind === 'room' && r.value === roomId))
    }, () => !cancelled && setRule(undefined))
    return () => { cancelled = true }
  }, [roomId, reload])

  const fail = (e: unknown) => setError(e instanceof Error ? e : new Error(String(e)))

  const save = async () => {
    setError(undefined)
    try {
      const updated = await setRoomSettings(roomId, { preset_id: preset || null, trigger: (trigger || null) as 'all' | 'mention' | null })
      setRoom(updated)
      onChanged()
    } catch (e) {
      fail(e)
    }
  }

  const confirm = async () => {
    const action = pending
    setPending(null)
    if (!action) return
    setError(undefined)
    try {
      if (action === 'remove') {
        if (rule) await deleteRule(rule.id)
      } else {
        await addRule({ list: action, kind: 'room', value: roomId })
      }
      setReload((n) => n + 1)
      const fresh = await getRoom(roomId)
      setRoom(fresh)
      onChanged()
    } catch (e) {
      fail(e)
    }
  }

  const locked = room ? room.kind === 'infrastructure' || room.encrypted : true
  const verb = pending === 'allow' ? 'Allow' : pending === 'deny' ? 'Deny' : 'Remove'

  return (
    <>
      {room && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography component="h2" variant="h6">{room.name ?? room.alias ?? room.room_id}</Typography>
          <Typography variant="body2" color="text.secondary">{room.room_id}</Typography>
          <FormError error={error} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessChip access={room.access} />
            {rule ? (
              <Button color="warning" onClick={() => setPending('remove')}>Remove rule</Button>
            ) : (
              <>
                <Button disabled={locked} onClick={() => setPending('allow')}>Allow room</Button>
                <Button disabled={locked} color="error" onClick={() => setPending('deny')}>Deny room</Button>
              </>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="h3" variant="subtitle1">Settings</Typography>
            <PresetSelect value={preset} onChange={setPreset} emptyLabel="Default preset" />
            <TextField select size="small" label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} fullWidth>
              <MenuItem value="">Default</MenuItem>
              <MenuItem value="all">All messages</MenuItem>
              <MenuItem value="mention">Only when mentioned</MenuItem>
            </TextField>
            <Button variant="contained" onClick={() => void save()} sx={{ alignSelf: 'flex-start' }}>Save</Button>
          </Box>
          <Typography component="h3" variant="subtitle1">Members</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>{['Name', 'Matrix id', 'Facebook id', 'Access'].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow>
            </TableHead>
            <TableBody>
              {room.members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>{m.display_name}</TableCell>
                  <TableCell>{m.user_id}</TableCell>
                  <TableCell>{m.facebook_id}</TableCell>
                  <TableCell><AccessChip access={m.access} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <RoomMessages roomId={room.room_id} />
        </Box>
      )}
      {!room && error && <FormError error={error} />}
      <ConfirmDialog
        open={pending !== null}
        title={pending === 'remove' ? 'Remove the room rule?' : `${verb} this room?`}
        body={pending === 'remove' ? 'The room falls back to the default policy.' : `Adds a ${pending} rule for this room.`}
        confirmLabel={verb}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
