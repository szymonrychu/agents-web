/** The history search results: one row per discarded session, with its hit count and up to 3 snippets. */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { MONO_FONT, TOKENS } from '../theme'
import type { SessionSummary } from './api'

export interface HistoryResultsProps {
  sessions: SessionSummary[]
  onOpen: (session: SessionSummary) => void
}

const MAX_SNIPPETS = 3
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB']

export function formatSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${SIZE_UNITS[unit]}`
}

export const formatCounts = (counts: Record<string, number>) =>
  Object.entries(counts).map(([kind, n]) => `${kind} ${n}`).join(', ')

const formatHits = (hits: number) => `${hits} ${hits === 1 ? 'hit' : 'hits'}`

const COLUMNS: Column<SessionSummary>[] = [
  { key: 'session', label: 'Session', role: 'primary', render: (s) => s.slug },
  { key: 'preset', label: 'Preset', role: 'meta', render: (s) => s.preset_name || '-' },
  { key: 'created', label: 'Created', role: 'meta', render: (s) => <DateTime iso={s.created_at} /> },
  { key: 'discarded', label: 'Discarded', role: 'meta', render: (s) => <DateTime iso={s.discarded_at} /> },
  { key: 'records', label: 'Records', role: 'meta', render: (s) => formatCounts(s.record_counts) || '-' },
  { key: 'size', label: 'Size', role: 'meta', render: (s) => formatSize(s.bytes) },
  { key: 'hits', label: 'Hits', role: 'meta', render: (s) => (s.hits == null ? '-' : formatHits(s.hits)) },
]

export function HistoryResults({ sessions, onOpen }: HistoryResultsProps) {
  return (
    <ResponsiveTable
      rows={sessions}
      columns={COLUMNS}
      rowKey={(s) => String(s.id)}
      ariaLabel="History results"
      cardLabel={(s) => `Session ${s.slug}`}
      onRowClick={onOpen}
      below={(s) =>
        s.matches.length > 0 && (
          <Box onClick={() => onOpen(s)} sx={{ cursor: 'pointer', minWidth: 0 }}>
            {s.matches.slice(0, MAX_SNIPPETS).map((m) => (
              <Typography key={m.record_id} component="div" noWrap sx={{ fontFamily: MONO_FONT, fontSize: TOKENS.fontSizes.sm, color: 'text.secondary' }}>
                <span>{m.kind}</span>{' '}<span>{m.snippet}</span>
              </Typography>
            ))}
          </Box>
        )
      }
    />
  )
}
