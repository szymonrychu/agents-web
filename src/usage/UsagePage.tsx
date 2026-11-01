/** Settings > Usage: how much of the Claude plan windows (5-hour, weekly) the agents have used. */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { Suspense, lazy } from 'react'
import { formatAge, useNow } from '../chat/agentAge'
import { TOKENS } from '../theme'
import { usePoll } from '../triggers'
import { getCurrent } from './api'
import type { WindowView } from './api'

/** The chart library is large: its chunk loads only when the Usage page opens. */
const UsageHistory = lazy(() => import('./UsageHistory'))

export interface UsagePageProps {
  onBack: () => void
}

const POLL_MS = 60_000
const WARN_PCT = 80
const ERROR_PCT = 95
/** The windows the service reports, in display order; any other metric follows alphabetically. */
const KNOWN_METRICS = ['five_hour', 'seven_day']
const TITLES: Record<string, string> = { five_hour: '5-hour window', seven_day: 'Weekly window' }
const SOURCES: Record<WindowView['source'], string> = { statusline: 'agents', probe: 'probe' }

const barColor = (percent: number) => (percent >= ERROR_PCT ? 'error' : percent >= WARN_PCT ? 'warning' : 'primary')
const formatPercent = (percent: number) => `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`
const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`

function metricOrder(metrics: string[]): string[] {
  const known = KNOWN_METRICS.filter((m) => metrics.includes(m))
  return [...known, ...metrics.filter((m) => !KNOWN_METRICS.includes(m)).sort()]
}

function WindowCard({ metric, window, now }: { metric: string; window: WindowView; now: number }) {
  return (
    <Box
      data-testid={`usage-card-${metric}`}
      sx={{ flex: '1 1 280px', minWidth: 0, p: 2, border: `${TOKENS.borderWidth}px solid ${TOKENS.border}`, borderRadius: `${TOKENS.radius}px`, display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.lg }}>{TITLES[metric] ?? metric}</Typography>
        <Typography sx={{ fontSize: TOKENS.fontSizes.xl, fontWeight: TOKENS.fontWeights.medium }}>{formatPercent(window.percent)}</Typography>
      </Box>
      <LinearProgress variant="determinate" color={barColor(window.percent)} value={Math.min(Math.max(window.percent, 0), 100)} />
      <Typography color="text.secondary" sx={{ fontSize: TOKENS.fontSizes.sm }}>
        {`resets in ${formatAge(Date.parse(window.resets_at) - now)} (${utc(window.resets_at)})`}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography color="text.secondary" sx={{ fontSize: TOKENS.fontSizes.sm }}>
          {`observed ${formatAge(now - Date.parse(window.observed_at))} ago`}
        </Typography>
        <Chip size="small" variant="outlined" label={SOURCES[window.source]} />
      </Box>
    </Box>
  )
}

export function UsagePage({ onBack }: UsagePageProps) {
  const now = useNow()
  const { data, error } = usePoll(getCurrent, POLL_MS, [])
  const windows = data?.windows ?? {}
  const metrics = metricOrder(Object.keys(windows))
  const anyStale = metrics.some((m) => windows[m].stale)
  const anyMissing = KNOWN_METRICS.some((m) => !(m in windows))
  const probe = data?.last_probe
  const probeFailed = probe !== undefined && probe !== null && !probe.ok && (anyStale || anyMissing)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Usage</Typography>
      </Box>
      {error && <Alert severity="warning">Usage service unavailable</Alert>}
      {anyStale && <Alert severity="warning">Usage data is stale</Alert>}
      {probeFailed && <Alert severity="warning">{`Last probe failed: ${probe.error ?? 'unknown error'}`}</Alert>}
      {data && metrics.length === 0 && <Typography color="text.secondary">No usage data yet</Typography>}
      {metrics.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {metrics.map((m) => <WindowCard key={m} metric={m} window={windows[m]} now={now} />)}
        </Box>
      )}
      <Box component="section" aria-label="Usage history">
        <Suspense fallback={<Typography color="text.secondary">Loading usage history</Typography>}>
          <UsageHistory />
        </Suspense>
      </Box>
    </Box>
  )
}
