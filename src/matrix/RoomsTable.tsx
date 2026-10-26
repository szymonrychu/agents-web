/** The discovered rooms: one row per room with kind, flags, access, routing and activity. */
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import type { RoomView } from './api'

export const KINDS: Record<string, string> = { dm: 'DM', group: 'Group', matrix: 'Matrix', infrastructure: 'Infrastructure' }
export const ACCESS_STATES = ['allowed', 'denied', 'default']
export const ALL = ''

const UNITS: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm']]
function relative(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  for (const [size, unit] of UNITS) if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`
  return `${secs}s ago`
}

export function AccessChip({ access }: { access: RoomView['access'] }) {
  const color = access.state === 'allowed' ? 'success' : access.state === 'denied' ? 'error' : 'default'
  const chip = <Chip size="small" label={access.state} color={color} aria-label={access.reason ? `${access.state}: ${access.reason}` : access.state} />
  return access.reason ? <Tooltip title={access.reason}>{chip}</Tooltip> : chip
}

export interface RoomsTableProps {
  rooms: RoomView[]
  kind: string
  access: string
  presetNames: Record<string, string>
  onKind: (kind: string) => void
  onAccess: (access: string) => void
  onSelect: (room: RoomView) => void
  onOpenSession: (sessionId: string) => void
}

export function RoomsTable({ rooms, kind, access, presetNames, onKind, onAccess, onSelect, onOpenSession }: RoomsTableProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => onKind(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value={ALL}>all</MenuItem>
          {Object.entries(KINDS).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Access" value={access} onChange={(e) => onAccess(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value={ALL}>all</MenuItem>
          {ACCESS_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Name', 'Kind', 'Flags', 'Members', 'Access', 'Preset', 'Trigger', 'Session', 'Last activity', 'Queued'].map((h) => <TableCell key={h}>{h}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rooms.map((r) => (
            <TableRow key={r.room_id} hover sx={{ cursor: 'pointer' }} onClick={() => onSelect(r)}>
              <TableCell>{r.name ?? r.alias ?? r.room_id}</TableCell>
              <TableCell>{r.kind ? (KINDS[r.kind] ?? r.kind) : ''}</TableCell>
              <TableCell>
                {r.message_request && <Chip size="small" variant="outlined" label="Message request" sx={{ mr: 0.5 }} />}
                {r.encrypted && <Chip size="small" variant="outlined" label="Encrypted" />}
              </TableCell>
              <TableCell>{r.member_count}</TableCell>
              <TableCell><AccessChip access={r.access} /></TableCell>
              <TableCell>{r.preset_id ? (presetNames[r.preset_id] ?? r.preset_id) : '-'}</TableCell>
              <TableCell>{r.effective_trigger}</TableCell>
              <TableCell>
                {r.session?.id ? (
                  <Link component="button" onClick={(e) => { e.stopPropagation(); onOpenSession(r.session!.id!) }}>
                    {r.session.slug ?? r.session.id}
                  </Link>
                ) : (r.session?.slug ?? '')}
              </TableCell>
              <TableCell>
                {r.last_event_at && (
                  <Tooltip title={new Date(r.last_event_at).toLocaleString()}><span>{relative(r.last_event_at)}</span></Tooltip>
                )}
              </TableCell>
              <TableCell>{r.queued}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
