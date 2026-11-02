/** Line chart of the plan windows over time, with dashed reference lines for the preset quotas. */
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine'
import { LineChart } from '@mui/x-charts/LineChart'
import { TOKENS } from '../theme'
import { MARGIN, Y_AXIS_WIDTH } from './chartLayout'
import { alignSeries } from './chartModel'
import type { QuotaLine, Series } from './chartModel'

export interface UsageChartProps {
  series: Series[]
  quotas: QuotaLine[]
  from: Date
  to: Date
  /** Fixed size in px; omitted, the chart fills its container. */
  width?: number
  height?: number
}

const SERIES_COLORS: Record<Series['metric'], string> = { five_hour: TOKENS.info, seven_day: TOKENS.accent }
const MARGIN_VERTICAL = { top: 16, bottom: 8 }
const DASH = '6 4'

const percent = (v: number | null) => (v === null ? '' : `${Number.isInteger(v) ? v : v.toFixed(1)}%`)
const tick = (d: Date) => `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}`

export function UsageChart({ series, quotas, from, to, width, height = 280 }: UsageChartProps) {
  const { x, values } = alignSeries(series)
  const top = Math.max(100, Math.ceil(Math.max(0, ...series.flatMap((s) => s.data.map((p) => p.y)))))
  return (
    <LineChart
      width={width}
      height={height}
      margin={{ ...MARGIN, ...MARGIN_VERTICAL }}
      xAxis={[{ scaleType: 'time', data: x, min: from, max: to, valueFormatter: tick }]}
      yAxis={[{ min: 0, max: top, width: Y_AXIS_WIDTH, valueFormatter: (v: number) => `${v}%` }]}
      series={series.map((s, i) => ({
        id: s.metric,
        label: s.label,
        data: values[i],
        color: SERIES_COLORS[s.metric],
        showMark: s.data.length === 1,
        connectNulls: true,
        valueFormatter: percent,
      }))}
    >
      {quotas.map((q) => (
        <ChartsReferenceLine key={`${q.value}-${q.label}`} y={q.value} label={q.label} labelAlign="end" lineStyle={{ strokeDasharray: DASH }} />
      ))}
    </LineChart>
  )
}
