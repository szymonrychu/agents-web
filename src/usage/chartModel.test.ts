import { describe, expect, test } from 'vitest'
import type { MarkView, PointView } from './api'
import { QUOTA_FIELD_LABELS, WINDOW_NAMES } from './quotaLabels'
import { MIN_BAR_FRACTION, ORIGIN_COLORS, alignSeries, quotaLines, rangeBounds, timelineBars, toSeries } from './chartModel'

const NOW = new Date('2026-11-01T12:00:00Z')
const HOUR = 3_600_000

const point = (metric: string, at: string, percent: number): PointView => ({ metric, observed_at: at, percent, resets_at: '2026-11-02T00:00:00Z', source: 'statusline' })
const mark = (o: Partial<MarkView> = {}): MarkView => ({
  session_id: 's-1', slug: 'alpha', preset_id: 'p-1', preset_name: 'fast', origin: 'ui', started_at: '2026-11-01T06:00:00Z', ended_at: '2026-11-01T08:00:00Z', ...o,
})

describe('rangeBounds', () => {
  test.each([['24h', 24 * HOUR], ['7d', 7 * 24 * HOUR], ['30d', 30 * 24 * HOUR]] as const)('%s ends at now and starts one span before', (range, span) => {
    const { from, to } = rangeBounds(range, NOW)
    expect(to.getTime()).toBe(NOW.getTime())
    expect(from.getTime()).toBe(NOW.getTime() - span)
  })
})

describe('toSeries', () => {
  test('keeps only five_hour and seven_day with data', () => {
    const series = toSeries([point('seven_day', '2026-11-01T10:00:00Z', 30), point('seven_day_opus', '2026-11-01T10:00:00Z', 5)])
    expect(series.map((s) => s.metric)).toEqual(['seven_day'])
    expect(toSeries([point('seven_day_opus', '2026-11-01T10:00:00Z', 5)])).toEqual([])
    expect(toSeries([])).toEqual([])
  })

  test('sorts by time and names lines', () => {
    const series = toSeries([
      point('seven_day', '2026-11-01T11:00:00Z', 31),
      point('five_hour', '2026-11-01T11:30:00Z', 12),
      point('five_hour', '2026-11-01T10:30:00Z', 10),
    ])
    expect(series.map((s) => s.label)).toEqual(['5-hour', 'Weekly'])
    expect(series[0].data).toEqual([{ x: new Date('2026-11-01T10:30:00Z'), y: 10 }, { x: new Date('2026-11-01T11:30:00Z'), y: 12 }])
  })
})

describe('alignSeries', () => {
  test('puts every series on the union of the timestamps, null where a series has no point', () => {
    const series = toSeries([
      point('five_hour', '2026-11-01T10:00:00Z', 10),
      point('five_hour', '2026-11-01T11:00:00Z', 12),
      point('seven_day', '2026-11-01T11:00:00Z', 31),
      point('seven_day', '2026-11-01T12:00:00Z', 32),
    ])
    const { x, values } = alignSeries(series)
    expect(x.map((d) => d.toISOString())).toEqual(['2026-11-01T10:00:00.000Z', '2026-11-01T11:00:00.000Z', '2026-11-01T12:00:00.000Z'])
    expect(values).toEqual([[10, 12, null], [null, 31, 32]])
  })
})

describe('quotaLines', () => {
  test('default plus distinct preset values, window named, capped at 6', () => {
    const lines = quotaLines(100, [
      { name: 'a', usage_quota: { five_hour_pct: 80 } },
      { name: 'b', usage_quota: { five_hour_pct: 80 } },
      { name: 'c', usage_quota: { seven_day_pct: 95 } },
      { name: 'd', usage_quota: { five_hour_pct: null, seven_day_pct: null } },
      { name: 'e' },
    ])
    expect(lines).toEqual([
      { value: 100, label: 'Default quota' },
      { value: 80, label: '5-hour quota: a, b' },
      { value: 95, label: 'Weekly quota: c' },
    ])
    const many = quotaLines(100, Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, usage_quota: { five_hour_pct: 10 + i } })))
    expect(many).toHaveLength(6)
    expect(many[0].value).toBe(100)
    expect(many.slice(1).map((l) => l.value)).toEqual([10, 11, 12, 13, 14])
  })

  test('the same value in both windows stays two lines, and a value equal to the default adds none', () => {
    const lines = quotaLines(90, [{ name: 'a', usage_quota: { five_hour_pct: 60, seven_day_pct: 60 } }, { name: 'b', usage_quota: { five_hour_pct: 90 } }])
    expect(lines.map((l) => l.label)).toEqual(['Default quota', '5-hour quota: a', 'Weekly quota: a'])
  })
})

describe('timelineBars', () => {
  const from = new Date('2026-11-01T00:00:00Z')
  const to = new Date('2026-11-02T00:00:00Z')
  const now = new Date('2026-11-01T12:00:00Z')

  test('fractions and clamping', () => {
    const [inside, early, late] = timelineBars(
      [
        mark({ session_id: 'a', started_at: '2026-11-01T06:00:00Z', ended_at: '2026-11-01T12:00:00Z' }),
        mark({ session_id: 'b', started_at: '2026-10-30T00:00:00Z', ended_at: '2026-11-01T01:00:00Z' }),
        mark({ session_id: 'c', started_at: '2026-11-01T20:00:00Z', ended_at: '2026-11-03T00:00:00Z' }),
      ],
      from, to, now,
    ).sort((a, b) => a.id.localeCompare(b.id))
    expect(inside.start).toBeCloseTo(0.25)
    expect(inside.end).toBeCloseTo(0.5)
    expect(early.start).toBe(0)
    expect(early.end).toBeCloseTo(1 / 24)
    expect(late.start).toBeCloseTo(20 / 24)
    expect(late.end).toBe(1)
  })

  test('marks wholly outside the range are dropped', () => {
    expect(timelineBars([mark({ started_at: '2026-10-01T00:00:00Z', ended_at: '2026-10-02T00:00:00Z' })], from, to, now)).toEqual([])
  })

  test('open session runs to now and says running', () => {
    const [bar] = timelineBars([mark({ ended_at: null })], from, to, now)
    expect(bar.running).toBe(true)
    expect(bar.end).toBeCloseTo((now.getTime() - from.getTime()) / (to.getTime() - from.getTime()))
    expect(bar.title).toBe('alpha | fast | ui | 2026-11-01 06:00 UTC | running')
  })

  test('open session in a range that ended before now stops at the range end', () => {
    const [bar] = timelineBars([mark({ ended_at: null })], from, new Date('2026-11-01T09:00:00Z'), now)
    expect(bar.end).toBe(1)
  })

  test('closed session title has start and end, a missing preset reads no preset', () => {
    const [bar] = timelineBars([mark({ preset_name: null })], from, to, now)
    expect(bar.running).toBe(false)
    expect(bar.presetName).toBeNull()
    expect(bar.title).toBe('alpha | no preset | ui | 2026-11-01 06:00 UTC - 2026-11-01 08:00 UTC')
  })

  test('lane packing: overlapping bars get lanes 0 and 1, a later bar reuses lane 0', () => {
    const bars = timelineBars(
      [
        mark({ session_id: 'a', started_at: '2026-11-01T01:00:00Z', ended_at: '2026-11-01T05:00:00Z' }),
        mark({ session_id: 'b', started_at: '2026-11-01T03:00:00Z', ended_at: '2026-11-01T06:00:00Z' }),
        mark({ session_id: 'c', started_at: '2026-11-01T07:00:00Z', ended_at: '2026-11-01T08:00:00Z' }),
      ],
      from, to, now,
    )
    expect(Object.fromEntries(bars.map((b) => [b.id, b.lane]))).toEqual({ a: 0, b: 1, c: 0 })
  })

  test('a zero-length bar still takes room in its lane', () => {
    const t = '2026-11-01T01:00:00Z'
    const bars = timelineBars([mark({ session_id: 'a', started_at: t, ended_at: t }), mark({ session_id: 'b', started_at: t, ended_at: t })], from, to, now)
    expect(bars.map((b) => b.lane)).toEqual([0, 1])
    expect(MIN_BAR_FRACTION).toBeGreaterThan(0)
  })
})

test('origin colors cover every origin with distinct values', () => {
  expect(Object.keys(ORIGIN_COLORS).sort()).toEqual(['agent', 'chat', 'other', 'schedule', 'ui', 'webhook'])
  expect(new Set(Object.values(ORIGIN_COLORS)).size).toBe(6)
})

test('the preset quota fields and the chart share the window names', () => {
  expect(QUOTA_FIELD_LABELS).toEqual({ five_hour: '5-hour quota percent', seven_day: 'Weekly quota percent' })
  expect(WINDOW_NAMES).toEqual({ five_hour: '5-hour', seven_day: 'Weekly' })
  expect(toSeries([point('five_hour', '2026-11-01T10:00:00Z', 1)])[0].label).toBe(WINDOW_NAMES.five_hour)
})
