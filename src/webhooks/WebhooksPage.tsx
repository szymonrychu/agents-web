/** Settings > Webhooks: recent events with status and endpoint filters, refreshed live. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { listEndpoints, listEvents } from './api'
import type { EndpointView, EventView } from './api'
import type { EndpointCreated } from './api'
import { CredentialsDialog } from './CredentialsDialog'
import { EndpointFormDialog } from './EndpointFormDialog'
import { EndpointsList } from './EndpointsList'
import { EventsTable } from './EventsTable'

export interface WebhooksPageProps {
  onBack: () => void
}

const PAGE = 50
const STATUSES = ['new', 'in-progress', 'handled', 'ignored', 'failed']
const ALL = ''

export function WebhooksPage({ onBack }: WebhooksPageProps) {
  const [status, setStatus] = useState(ALL)
  const [endpointId, setEndpointId] = useState(ALL)
  const [endpoints, setEndpoints] = useState<EndpointView[]>([])
  const [older, setOlder] = useState<EventView[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [olderError, setOlderError] = useState<Error>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<EndpointCreated | null>(null)

  const filter = { status: status || undefined, endpointId: endpointId || undefined }
  const { data, error } = usePoll(() => listEvents({ ...filter, limit: PAGE }), 5000, [status, endpointId])

  useEffect(() => {
    listEndpoints().then(setEndpoints, () => setEndpoints([]))
  }, [refreshKey])
  const refresh = () => setRefreshKey((k) => k + 1)
  const resetPaging = () => {
    setOlder([])
    setExhausted(false)
    setOlderError(undefined)
  }

  const head = data ?? []
  const seen = new Set(head.map((e) => e.id))
  const events = [...head, ...older.filter((e) => !seen.has(e.id))]
  const canLoadMore = !exhausted && (older.length > 0 || head.length >= PAGE)

  const loadOlder = async () => {
    const last = events[events.length - 1]
    if (!last) return
    try {
      const page = await listEvents({ ...filter, limit: PAGE, beforeId: String(last.id) })
      setOlder((o) => [...o, ...page])
      if (page.length < PAGE) setExhausted(true)
    } catch (e) {
      setOlderError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Webhooks</Typography>
      </Box>
      <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="h2" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.md }}>Endpoints</Typography>
          <Button variant="contained" onClick={() => setCreating(true)}>New endpoint</Button>
        </Box>
        <EndpointsList refreshKey={refreshKey} onChanged={refresh} onCreate={() => setCreating(true)} />
      </Box>
      <EndpointFormDialog
        open={creating}
        mode="create"
        onClose={() => setCreating(false)}
        onDone={(created) => { setCreating(false); setCredentials(created); refresh() }}
      />
      <CredentialsDialog endpoint={credentials} onClose={() => setCredentials(null)} />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); resetPaging() }} sx={{ minWidth: 160 }}>
          <MenuItem value={ALL}>all</MenuItem>
          {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Endpoint" value={endpointId} onChange={(e) => { setEndpointId(e.target.value); resetPaging() }} sx={{ minWidth: 200 }}>
          <MenuItem value={ALL}>all</MenuItem>
          {endpoints.map((ep) => <MenuItem key={ep.id} value={String(ep.id)}>{ep.suffix}</MenuItem>)}
        </TextField>
      </Box>
      <FormError error={error ?? olderError} />
      {data && events.length === 0 ? (
        <Typography color="text.secondary">No events yet. Create an endpoint in the endpoints section above to start receiving them.</Typography>
      ) : (
        <EventsTable events={events} />
      )}
      {canLoadMore && <Button onClick={() => void loadOlder()} sx={{ alignSelf: 'flex-start' }}>Load older</Button>}
    </Box>
  )
}
