/** Settings > History: search discarded sessions by text or regex, filter them and open one. */
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { listSessions } from './api'
import type { SessionSummary, SessionsQuery } from './api'
import { HistoryResults } from './HistoryResults'
import { HistorySessionView } from './HistorySessionView'

export interface HistoryPageProps {
  onBack: () => void
}

const PAGE = 50
const MIN_Q = 3
const DATE_FIELD = { slotProps: { inputLabel: { shrink: true } } } as const

/** Start of the picked local day, as ISO 8601. */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString()
/** Last millisecond of the picked local day, as ISO 8601. */
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999`).toISOString()

export function HistoryPage({ onBack }: HistoryPageProps) {
  const [q, setQ] = useState('')
  const [regex, setRegex] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState('')
  const [session, setSession] = useState('')
  const [submitted, setSubmitted] = useState<SessionsQuery>()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error>()
  const [open, setOpen] = useState<SessionSummary>()
  const latest = useRef(0)

  const qTooShort = q.length > 0 && q.length < MIN_Q

  const fetchPage = async (query: SessionsQuery, append: boolean) => {
    const ticket = ++latest.current
    setLoading(true)
    setError(undefined)
    try {
      const page = await listSessions(query)
      if (ticket !== latest.current) return
      setSessions((prev) => (append ? [...prev, ...page.filter((p) => !prev.some((o) => o.id === p.id))] : page))
      // agents-history applies every filter before the page cut, so a page shorter than the limit is the end.
      setExhausted(page.length < (query.limit ?? PAGE))
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (qTooShort) return
    const query: SessionsQuery = { limit: PAGE }
    if (q) query.q = q
    if (q && regex) query.regex = true
    if (from) query.from = dayStart(from)
    if (to) query.to = dayEnd(to)
    if (preset) query.preset = preset
    if (session) query.session = session
    setSubmitted(query)
    setSessions([])
    setExhausted(false)
    void fetchPage(query, false)
  }

  const afterDelete = () => {
    setOpen(undefined)
    setSessions([])
    setExhausted(false)
    if (submitted) void fetchPage(submitted, false)
  }

  const loadMore = () => {
    const last = sessions[sessions.length - 1]
    if (submitted && last) void fetchPage({ ...submitted, before_id: last.id }, true)
  }

  if (open) return <HistorySessionView sessionId={open.session_id} onBack={() => setOpen(undefined)} onDeleted={afterDelete} />

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>History</Typography>
      </Box>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            error={qTooShort}
            helperText={qTooShort ? `Type at least ${MIN_Q} characters` : undefined}
            sx={{ flexGrow: 1, minWidth: 240 }}
          />
          <FormControlLabel control={<Switch checked={regex} onChange={(e) => setRegex(e.target.checked)} />} label="Regex" />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} {...DATE_FIELD} />
          <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} {...DATE_FIELD} />
          <TextField size="small" label="Preset" value={preset} onChange={(e) => setPreset(e.target.value)} />
          <TextField size="small" label="Session" value={session} onChange={(e) => setSession(e.target.value)} />
          <Button type="submit" variant="contained" disabled={qTooShort || loading}>Search</Button>
        </Box>
      </Box>
      <FormError error={error} />
      {submitted && !error && !loading && sessions.length === 0 ? (
        <Typography color="text.secondary">No sessions match.</Typography>
      ) : (
        <HistoryResults sessions={sessions} onOpen={setOpen} />
      )}
      {submitted && sessions.length > 0 && !exhausted && (
        <Button onClick={loadMore} disabled={loading} sx={{ alignSelf: 'flex-start' }}>Load more</Button>
      )}
    </Box>
  )
}
