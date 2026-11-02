/** The raw records of one stored session: kind filter, text filter with a regex switch, collapsed JSON bodies, paged forwards. */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { MONO_FONT, TOKENS } from '../theme'
import { FormError } from '../triggers'
import { listRecords } from './api'
import type { RecordView, RecordsQuery } from './api'

const PAGE = 200
const MIN_Q = 3
const PREVIEW_CHARS = 160

export interface RecordsListProps {
  sessionId: string
  /** Record kind to count, from the session's `record_counts`. */
  kindCounts: Readonly<Record<string, number>>
}

const preview = (body: unknown): string => {
  const text = typeof body === 'string' ? body : JSON.stringify(body) ?? ''
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}...` : text
}

function pageQuery(kind: string, applied: { q: string; regex: boolean }, afterId: number): RecordsQuery {
  const query: RecordsQuery = { after_id: afterId, limit: PAGE }
  if (kind) query.kind = kind
  if (applied.q) {
    query.q = applied.q
    if (applied.regex) query.regex = true
  }
  return query
}

function RecordRow({ record }: { record: RecordView }) {
  const [open, setOpen] = useState(false)
  return (
    <Box sx={{ borderBottom: `${TOKENS.borderWidth}px solid ${TOKENS.border}`, py: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip size="small" label={record.kind} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{record.ts ? new Date(record.ts).toLocaleString() : ''}</Typography>
        {record.truncated && <Chip size="small" color="warning" variant="outlined" label="truncated" />}
        <Typography noWrap sx={{ flexGrow: 1, minWidth: 0, fontFamily: MONO_FONT, fontSize: TOKENS.fontSizes.sm, color: 'text.secondary' }}>
          {open ? '' : preview(record.body)}
        </Typography>
        <Button size="small" aria-label={`${open ? 'Hide' : 'Show'} record ${record.id}`} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </Box>
      {open && (
        <Box component="pre" sx={{ m: 0, mt: 0.5, fontFamily: MONO_FONT, fontSize: TOKENS.fontSizes.sm, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(record.body, null, 2)}
        </Box>
      )}
    </Box>
  )
}

interface Loaded {
  /** The query this result answers; a different current query means a load is in flight. */
  key: string
  records: RecordView[]
  next: number | null
  error?: Error
}

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

export function RecordsList({ sessionId, kindCounts }: RecordsListProps) {
  const [kind, setKind] = useState('')
  const [text, setText] = useState('')
  const [regex, setRegex] = useState(false)
  /** The filter text last applied; the kind select applies at once. */
  const [applied, setApplied] = useState({ q: '', regex: false })
  const [loaded, setLoaded] = useState<Loaded>()
  const [loadingMore, setLoadingMore] = useState(false)

  const key = `${sessionId}|${kind}|${applied.q}|${applied.regex}`

  // A new session, kind or applied filter restarts from the first record; a superseded response is dropped.
  useEffect(() => {
    let active = true
    listRecords(sessionId, pageQuery(kind, applied, 0)).then(
      (page) => active && setLoaded({ key, records: page.records, next: page.next_after_id }),
      (e: unknown) => active && setLoaded({ key, records: [], next: null, error: asError(e) }),
    )
    return () => {
      active = false
    }
  }, [sessionId, kind, applied, key])

  const current = loaded?.key === key ? loaded : undefined
  const loading = current === undefined

  const loadMore = async () => {
    if (!current || current.next === null) return
    setLoadingMore(true)
    try {
      const page = await listRecords(sessionId, pageQuery(kind, applied, current.next))
      setLoaded((prev) => (prev?.key === key ? { key, records: [...prev.records, ...page.records], next: page.next_after_id } : prev))
    } catch (e) {
      setLoaded((prev) => (prev?.key === key ? { ...prev, error: asError(e) } : prev))
    } finally {
      setLoadingMore(false)
    }
  }

  const qTooShort = text.length > 0 && text.length < MIN_Q
  const apply = (e: FormEvent) => {
    e.preventDefault()
    if (!qTooShort) setApplied({ q: text, regex })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, overflow: 'auto' }}>
      <Box component="form" onSubmit={apply} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All kinds</MenuItem>
          {Object.entries(kindCounts).map(([k, n]) => <MenuItem key={k} value={k}>{`${k} (${n})`}</MenuItem>)}
        </TextField>
        <TextField
          size="small"
          label="Filter text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={qTooShort}
          helperText={qTooShort ? `Type at least ${MIN_Q} characters` : undefined}
          sx={{ flexGrow: 1, minWidth: 240 }}
        />
        <FormControlLabel control={<Switch checked={regex} onChange={(e) => setRegex(e.target.checked)} />} label="Regex" />
        <Button type="submit" variant="contained" disabled={qTooShort || loading}>Apply</Button>
      </Box>
      <FormError error={current?.error} />
      {current && !current.error && current.records.length === 0 && <Typography color="text.secondary">No records.</Typography>}
      {current?.records.map((r) => <RecordRow key={r.id} record={r} />)}
      {current && current.next !== null && (
        <Button onClick={() => void loadMore()} disabled={loadingMore} sx={{ alignSelf: 'flex-start' }}>Load more</Button>
      )}
    </Box>
  )
}
