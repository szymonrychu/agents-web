/** The history search results: one row per discarded session, with its hit count and up to 3 snippets. */
import { Fragment } from 'react'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { MONO_FONT, TOKENS } from '../theme'
import type { SessionSummary } from './api'

export interface HistoryResultsProps {
  sessions: SessionSummary[]
  onOpen: (session: SessionSummary) => void
}

const COLUMNS = ['Session', 'Preset', 'Created', 'Discarded', 'Records', 'Size', 'Hits']
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

export function HistoryResults({ sessions, onOpen }: HistoryResultsProps) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {COLUMNS.map((h) => <TableCell key={h}>{h}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.map((s) => (
          <Fragment key={s.id}>
            <TableRow hover onClick={() => onOpen(s)} sx={{ cursor: 'pointer', '& > td': s.matches.length > 0 ? { borderBottom: 0 } : undefined }}>
              <TableCell><Link component="button" type="button" underline="hover">{s.slug}</Link></TableCell>
              <TableCell>{s.preset_name}</TableCell>
              <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
              <TableCell>{new Date(s.discarded_at).toLocaleString()}</TableCell>
              <TableCell>{formatCounts(s.record_counts)}</TableCell>
              <TableCell>{formatSize(s.bytes)}</TableCell>
              <TableCell>{s.hits == null ? '' : formatHits(s.hits)}</TableCell>
            </TableRow>
            {s.matches.length > 0 && (
              <TableRow hover onClick={() => onOpen(s)} sx={{ cursor: 'pointer' }}>
                <TableCell colSpan={COLUMNS.length} sx={{ pt: 0 }}>
                  {s.matches.slice(0, MAX_SNIPPETS).map((m) => (
                    <Typography key={m.record_id} component="div" noWrap sx={{ fontFamily: MONO_FONT, fontSize: TOKENS.fontSizes.sm, color: 'text.secondary' }}>
                      <span>{m.kind}</span>{' '}<span>{m.snippet}</span>
                    </Typography>
                  ))}
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
