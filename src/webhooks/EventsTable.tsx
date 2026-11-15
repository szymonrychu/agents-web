/** The recent webhook events: one row per event with its status, reason and routing. */
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableContainer from '@mui/material/TableContainer'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import { ChainStatusChip, RunStatusChip } from '../triggers'
import type { RunStatus } from '../triggers'
import type { EventView } from './api'
import { hideOnPhone, TABLE_SCROLL_SX } from '../layout/tables'

const HIDE_ON_PHONE = new Set(['Endpoint', 'Kind', 'Item', 'Chain', 'Session'])

export interface EventsTableProps {
  events: EventView[]
}

const UNITS: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm']]

function relative(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  for (const [size, unit] of UNITS) if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`
  return `${secs}s ago`
}

function Routing({ event }: { event: EventView }) {
  if (event.update_of != null) return <Link href={`#event-${event.update_of}`}>{`update of #${event.update_of}`}</Link>
  if (event.duplicate_of != null) return <Link href={`#event-${event.duplicate_of}`}>{`duplicate of #${event.duplicate_of}`}</Link>
  return null
}

export function EventsTable({ events }: EventsTableProps) {
  return (
    <TableContainer sx={TABLE_SCROLL_SX}>
    <Table size="small">
      <TableHead>
        <TableRow>
          {['Received', 'Endpoint', 'Kind', 'Item', 'Title', 'Status', 'Chain', 'Session'].map((h) => (
            <TableCell key={h} sx={HIDE_ON_PHONE.has(h) ? hideOnPhone : undefined}>{h}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {events.map((e) => {
          const ref = e.repo && e.number != null ? `${e.repo}#${e.number}` : (e.repo ?? '')
          return (
            <TableRow key={e.id} id={`event-${e.id}`}>
              <TableCell>
                <Tooltip title={new Date(e.received_at).toLocaleString()}>
                  <span>{relative(e.received_at)}</span>
                </Tooltip>
              </TableCell>
              <TableCell sx={hideOnPhone}>{`${e.endpoint_suffix} (${e.type})`}</TableCell>
              <TableCell sx={hideOnPhone}>{e.kind}</TableCell>
              <TableCell sx={hideOnPhone}>{e.url ? <Link href={e.url} target="_blank" rel="noreferrer">{ref}</Link> : ref}</TableCell>
              <TableCell>{e.title}</TableCell>
              <TableCell>
                <RunStatusChip status={e.status as RunStatus} reason={e.reason ?? undefined} />
                <Routing event={e} />
              </TableCell>
              <TableCell sx={hideOnPhone}><ChainStatusChip status={e.chain_status} /></TableCell>
              <TableCell sx={hideOnPhone}>{e.session_slug ?? e.session_id}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    </TableContainer>
  )
}
