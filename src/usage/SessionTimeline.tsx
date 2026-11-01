/** Session start/end lane under the usage chart: one bar per session, on the chart's time axis. */
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { MARGIN, PLOT_LEFT } from './chartLayout'
import { MIN_BAR_FRACTION, ORIGIN_COLORS, timelineBars } from './chartModel'
import type { MarkView } from './api'

export interface SessionTimelineProps {
  marks: MarkView[]
  from: Date
  to: Date
  now: Date
}

const LANE_PX = 14
const BAR_PX = 10

export function SessionTimeline({ marks, from, to, now }: SessionTimelineProps) {
  const bars = timelineBars(marks, from, to, now)
  if (bars.length === 0) return <Typography color="text.secondary" sx={{ fontSize: TOKENS.fontSizes.sm, pl: `${PLOT_LEFT}px` }}>No sessions in this range</Typography>
  const lanes = Math.max(...bars.map((b) => b.lane)) + 1
  return (
    <Box data-testid="session-timeline" sx={{ position: 'relative', pl: `${PLOT_LEFT}px`, pr: `${MARGIN.right}px` }}>
      <Typography color="text.secondary" sx={{ position: 'absolute', left: 0, top: 0, width: PLOT_LEFT - 8, textAlign: 'right', fontSize: TOKENS.fontSizes.sm }}>Sessions</Typography>
      <svg width="100%" height={lanes * LANE_PX} role="img" aria-label="Sessions over time" style={{ display: 'block' }}>
        {bars.map((b) => (
          <Tooltip key={b.id} title={b.title} placement="top" arrow>
            <rect
              data-testid={`session-bar-${b.id}`}
              x={`${b.start * 100}%`}
              y={b.lane * LANE_PX}
              width={`${Math.max(b.end - b.start, MIN_BAR_FRACTION) * 100}%`}
              height={BAR_PX}
              fill={ORIGIN_COLORS[b.origin] ?? ORIGIN_COLORS.other}
            />
          </Tooltip>
        ))}
      </svg>
    </Box>
  )
}
