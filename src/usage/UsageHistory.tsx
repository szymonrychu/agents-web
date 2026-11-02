/** Usage history: the plan windows over a range with the preset quota lines, and the session start/end lane under it. */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { getMeta, listPresets } from '../api/client'
import type { SessionSpec } from '../api/client'
import { TOKENS } from '../theme'
import { usePoll } from '../triggers'
import { getHistory, getSessions } from './api'
import type { HistoryView, SessionsView } from './api'
import { quotaLines, rangeBounds, toSeries } from './chartModel'
import type { PresetQuota, QuotaLine, Range } from './chartModel'
import { SessionTimeline } from './SessionTimeline'
import { UsageChart } from './UsageChart'

const POLL_MS = 60_000
const MAX_POINTS = 500
const RANGES: Range[] = ['24h', '7d', '30d']

interface Loaded {
  from: Date
  to: Date
  history: HistoryView
  sessions: SessionsView
}

async function load(range: Range): Promise<Loaded> {
  const { from, to } = rangeBounds(range, new Date())
  const span = { from: from.toISOString(), to: to.toISOString() }
  const [history, sessions] = await Promise.all([getHistory({ ...span, max_points: MAX_POINTS }), getSessions(span)])
  return { from, to, history, sessions }
}

/** The quota reference lines; the chart shows none when the presets or the default cannot be loaded. */
function useQuotaLines(): QuotaLine[] {
  const [lines, setLines] = useState<QuotaLine[]>([])
  useEffect(() => {
    let alive = true
    Promise.all([getMeta(), listPresets()])
      .then(([meta, presets]) => {
        const quotas: PresetQuota[] = presets.map((p) => ({ name: p.name, usage_quota: (p.spec as Pick<SessionSpec, 'usage_quota'>).usage_quota }))
        if (alive) setLines(quotaLines(meta.usage.quota_default_pct, quotas))
      })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])
  return lines
}

export default function UsageHistory() {
  const [range, setRange] = useState<Range>('7d')
  const { data, error } = usePoll(() => load(range), POLL_MS, [range])
  const quotas = useQuotaLines()
  const series = useMemo(() => toSeries(data?.history.points ?? []), [data])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.lg }}>Usage history</Typography>
        <ToggleButtonGroup exclusive size="small" aria-label="History range" value={range} onChange={(_e, next: Range | null) => next && setRange(next)}>
          {RANGES.map((r) => <ToggleButton key={r} value={r}>{r}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>
      {error && <Alert severity="warning">Usage history unavailable</Alert>}
      {!error && data && series.length === 0 && <Typography color="text.secondary">No usage history in this range</Typography>}
      {!error && data && series.length > 0 && <UsageChart series={series} quotas={quotas} from={data.from} to={data.to} />}
      {!error && data && <SessionTimeline marks={data.sessions.marks} from={data.from} to={data.to} now={data.to} />}
    </Box>
  )
}
