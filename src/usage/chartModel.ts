/** Pure model of the usage history chart and the session timeline. */
import { TOKENS, terminalTheme } from '../theme'
import type { MarkView, PointView } from './api'
import { WINDOW_NAMES } from './quotaLabels'
import type { QuotaWindow } from './quotaLabels'

export type Range = '24h' | '7d' | '30d'

const HOUR_MS = 3_600_000
const SPAN_MS: Record<Range, number> = { '24h': 24 * HOUR_MS, '7d': 7 * 24 * HOUR_MS, '30d': 30 * 24 * HOUR_MS }

export function rangeBounds(range: Range, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - SPAN_MS[range]), to: now }
}

export interface Series {
  metric: QuotaWindow
  label: string
  data: { x: Date; y: number }[]
}

const SERIES_METRICS: QuotaWindow[] = ['five_hour', 'seven_day']

/** One series per plan window that has at least one point, in time order; any other metric is dropped. */
export function toSeries(points: PointView[]): Series[] {
  return SERIES_METRICS.flatMap((metric) => {
    const data = points
      .filter((p) => p.metric === metric)
      .map((p) => ({ x: new Date(p.observed_at), y: p.percent }))
      .sort((a, b) => a.x.getTime() - b.x.getTime())
    return data.length > 0 ? [{ metric, label: WINDOW_NAMES[metric], data }] : []
  })
}

/**
 * The series on one shared x axis (x-charts takes one x array for all lines): the sorted union of the timestamps,
 * and per series its value at each timestamp or null where that series has no point.
 */
export function alignSeries(series: Series[]): { x: Date[]; values: (number | null)[][] } {
  const times = [...new Set(series.flatMap((s) => s.data.map((p) => p.x.getTime())))].sort((a, b) => a - b)
  return {
    x: times.map((t) => new Date(t)),
    values: series.map((s) => {
      const byTime = new Map(s.data.map((p) => [p.x.getTime(), p.y]))
      return times.map((t) => byTime.get(t) ?? null)
    }),
  }
}

export interface QuotaLine {
  value: number
  label: string
}

export interface PresetQuota {
  name: string
  usage_quota?: { five_hour_pct?: number | null; seven_day_pct?: number | null } | null
}

const MAX_QUOTA_LINES = 6
const PRESET_FIELDS: [QuotaWindow, 'five_hour_pct' | 'seven_day_pct'][] = [['five_hour', 'five_hour_pct'], ['seven_day', 'seven_day_pct']]

/**
 * Reference lines for the chart: the orchestrator default first, then one line per distinct (window, value) of the
 * presets' sparse quotas, labelled with the window and the preset names, ordered by value. A preset value equal to the
 * default adds nothing and is left out. At most six lines.
 */
export function quotaLines(defaultPct: number, presets: PresetQuota[]): QuotaLine[] {
  const groups = new Map<string, { window: QuotaWindow; value: number; names: string[] }>()
  for (const preset of presets) {
    for (const [window, field] of PRESET_FIELDS) {
      const value = preset.usage_quota?.[field]
      if (value === null || value === undefined || value === defaultPct) continue
      const key = `${window}:${value}`
      const group = groups.get(key) ?? { window, value, names: [] }
      group.names.push(preset.name)
      groups.set(key, group)
    }
  }
  const sorted = [...groups.values()].sort((a, b) => a.value - b.value || SERIES_METRICS.indexOf(a.window) - SERIES_METRICS.indexOf(b.window))
  const lines = sorted.map((g) => ({ value: g.value, label: `${WINDOW_NAMES[g.window]} quota: ${g.names.join(', ')}` }))
  return [{ value: defaultPct, label: 'Default quota' }, ...lines].slice(0, MAX_QUOTA_LINES)
}

/** Bar colour per session origin: six distinct hues from the theme tokens (the palette's own roles are all grey). */
export const ORIGIN_COLORS: Record<string, string> = {
  ui: TOKENS.info,
  webhook: terminalTheme.cyan,
  schedule: terminalTheme.green,
  chat: TOKENS.attention,
  agent: TOKENS.warning,
  other: TOKENS.textSecondary,
}

/** Narrowest drawn bar, as a fraction of the range; lane packing counts it as the bar's extent. */
export const MIN_BAR_FRACTION = 0.002

export interface TimelineBar {
  id: string
  slug: string
  presetName: string | null
  origin: string
  start: number
  end: number
  lane: number
  running: boolean
  title: string
}

const stamp = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`

/**
 * One bar per session mark overlapping `[from, to]`: start and end as fractions of the range (clamped), an open
 * session running to `min(now, to)`, lanes packed greedily so overlapping bars never share one.
 */
export function timelineBars(marks: MarkView[], from: Date, to: Date, now: Date): TimelineBar[] {
  const lo = from.getTime()
  const span = to.getTime() - lo
  const frac = (ms: number) => Math.min(Math.max((ms - lo) / span, 0), 1)
  const openEnd = Math.min(now.getTime(), to.getTime())
  const bars = marks
    .map((m) => {
      const startMs = Date.parse(m.started_at)
      const running = m.ended_at === null
      const endMs = running ? openEnd : Date.parse(m.ended_at as string)
      return { m, startMs, endMs, running }
    })
    .filter(({ startMs, endMs }) => endMs >= lo && startMs <= to.getTime())
    .sort((a, b) => a.startMs - b.startMs)
  const laneEnds: number[] = []
  return bars.map(({ m, startMs, endMs, running }) => {
    const start = frac(startMs)
    const end = frac(endMs)
    let lane = laneEnds.findIndex((last) => last < start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = Math.max(end, start + MIN_BAR_FRACTION)
    const when = running ? `${stamp(startMs)} | running` : `${stamp(startMs)} - ${stamp(endMs)}`
    return {
      id: m.session_id,
      slug: m.slug,
      presetName: m.preset_name,
      origin: m.origin,
      start,
      end,
      lane,
      running,
      title: `${m.slug} | ${m.preset_name ?? 'no preset'} | ${m.origin} | ${when}`,
    }
  })
}
