/** The recent webhook events: one row per event with its status, reason and routing. */
import Link from '@mui/material/Link'
import { ChainStatusChip, RunStatusChip } from '../triggers'
import type { RunStatus } from '../triggers'
import type { EventView } from './api'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

export interface EventsTableProps {
  events: EventView[]
}

function Routing({ event }: { event: EventView }) {
  if (event.update_of != null) return <Link href={`#event-${event.update_of}`}>{`update of #${event.update_of}`}</Link>
  if (event.duplicate_of != null) return <Link href={`#event-${event.duplicate_of}`}>{`duplicate of #${event.duplicate_of}`}</Link>
  return null
}

const ref = (e: EventView) => (e.repo && e.number != null ? `${e.repo}#${e.number}` : (e.repo ?? ''))

const COLUMNS: Column<EventView>[] = [
  { key: 'received', label: 'Received', role: 'meta', render: (e) => <DateTime iso={e.received_at} /> },
  { key: 'endpoint', label: 'Endpoint', role: 'none', render: (e) => `${e.endpoint_suffix} (${e.type})` },
  { key: 'kind', label: 'Kind', role: 'meta', render: (e) => e.kind || '-' },
  { key: 'item', label: 'Item', role: 'meta', render: (e) => (e.url ? <Link href={e.url} target="_blank" rel="noreferrer">{ref(e)}</Link> : (ref(e) || '-')) },
  { key: 'title', label: 'Title', role: 'primary', render: (e) => e.title || '-' },
  {
    key: 'status', label: 'Status', role: 'meta',
    render: (e) => (
      <>
        <RunStatusChip status={e.status as RunStatus} reason={e.reason ?? undefined} />
        <Routing event={e} />
      </>
    ),
  },
  { key: 'chain', label: 'Chain', role: 'meta', render: (e) => (e.chain_status ? <ChainStatusChip status={e.chain_status} /> : '-') },
  { key: 'session', label: 'Session', role: 'meta', render: (e) => e.session_slug ?? e.session_id ?? '-' },
]

export function EventsTable({ events }: EventsTableProps) {
  return (
    <ResponsiveTable
      rows={events}
      columns={COLUMNS}
      rowKey={(e) => String(e.id)}
      rowId={(e) => `event-${e.id}`}
      ariaLabel="Events"
      cardLabel={(e) => `Event ${e.id}`}
    />
  )
}
