// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import { MARGIN, PLOT_LEFT, Y_AXIS_WIDTH } from './chartLayout'
import type { QuotaLine, Series } from './chartModel'
import { UsageChart } from './UsageChart'

const FROM = new Date('2026-10-25T00:00:00Z')
const TO = new Date('2026-11-01T00:00:00Z')
const WIDTH = 600
const HEIGHT = 280

const five: Series = { metric: 'five_hour', label: '5-hour', data: [{ x: FROM, y: 20 }, { x: new Date('2026-10-28T00:00:00Z'), y: 40 }, { x: TO, y: 60 }] }
const week: Series = { metric: 'seven_day', label: 'Weekly', data: [{ x: new Date('2026-10-30T00:00:00Z'), y: 5 }, { x: TO, y: 9 }] }

const mount = (series: Series[], quotas: QuotaLine[] = []) =>
  render(<ThemeProvider theme={theme}><UsageChart series={series} quotas={quotas} from={FROM} to={TO} width={WIDTH} height={HEIGHT} /></ThemeProvider>)
const line = (c: HTMLElement, metric: string) => c.querySelector(`path.MuiLineChart-line[data-series="${metric}"]`)
const coords = (d: string | null | undefined) => [...(d ?? '').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
const referenceLines = (c: HTMLElement) => [...c.querySelectorAll('.MuiChartsReferenceLine-root')]

afterEach(cleanup)

describe('UsageChart', () => {
  test('draws one line per series', () => {
    const { container } = mount([five, week])
    expect(container.querySelectorAll('path.MuiLineChart-line')).toHaveLength(2)
    expect(line(container, 'five_hour')).toBeTruthy()
    expect(line(container, 'seven_day')).toBeTruthy()
    const legend = [...container.querySelectorAll('.MuiChartsLegend-label')].map((e) => e.textContent)
    expect(legend).toEqual(['5-hour', 'Weekly'])
  })

  test('draws dashed quota reference lines with their labels', () => {
    const { container } = mount([five], [{ value: 100, label: 'Default quota' }, { value: 80, label: '5-hour quota: a, b' }])
    const lines = referenceLines(container)
    expect(lines).toHaveLength(2)
    for (const l of lines) expect(l.querySelector('path')?.getAttribute('style')).toContain('stroke-dasharray: 6 4')
    expect(lines.map((l) => l.textContent)).toEqual(['Default quota', '5-hour quota: a, b'])
    const y = lines.map((l) => Number(/ ([\d.]+) l/.exec(l.querySelector('path')?.getAttribute('d') ?? '')?.[1]))
    expect(y[1]).toBeGreaterThan(y[0])
  })

  test('y axis covers values above 100', () => {
    const over: Series = { ...five, data: [{ x: FROM, y: 50 }, { x: TO, y: 103 }] }
    const { container } = mount([over], [{ value: 100, label: 'Default quota' }])
    const top = coords(line(container, 'five_hour')?.getAttribute('d')).at(-1)?.y
    const quotaY = Number(/ ([\d.]+) l/.exec(referenceLines(container)[0].querySelector('path')?.getAttribute('d') ?? '')?.[1])
    expect(top).toBe(16)
    expect(quotaY).toBeGreaterThan(16)
  })

  test('y axis stops at 100 when the data does', () => {
    const { container } = mount([five], [{ value: 100, label: 'Default quota' }])
    const quotaY = Number(/ ([\d.]+) l/.exec(referenceLines(container)[0].querySelector('path')?.getAttribute('d') ?? '')?.[1])
    expect(quotaY).toBe(16)
  })

  test('x axis spans from to to', () => {
    const { container } = mount([five])
    const points = coords(line(container, 'five_hour')?.getAttribute('d'))
    const first = points[0]
    const last = points.at(-1)
    expect(first.x).toBe(PLOT_LEFT)
    expect(last?.x).toBe(WIDTH - MARGIN.right)
  })

  test('x axis is pinned to the range even when a series starts later', () => {
    const { container } = mount([week])
    const points = coords(line(container, 'seven_day')?.getAttribute('d'))
    const plotWidth = WIDTH - MARGIN.right - PLOT_LEFT
    expect(points[0].x).toBeCloseTo(PLOT_LEFT + plotWidth * (5 / 7), 1)
    expect(points.at(-1)?.x).toBe(WIDTH - MARGIN.right)
  })

  test('the plot starts at the shared left edge the session lane pads by', () => {
    const { container } = mount([five])
    const axis = container.querySelector('.MuiChartsAxis-directionX .MuiChartsAxis-line')
    expect(Number(axis?.getAttribute('x1'))).toBe(MARGIN.left + Y_AXIS_WIDTH)
    expect(Number(axis?.getAttribute('x2'))).toBe(WIDTH - MARGIN.right)
  })

  test('a series with a single point still shows a mark', () => {
    const one: Series = { ...week, data: [week.data[0]] }
    const { container } = mount([one])
    expect(container.querySelectorAll('.MuiLineChart-mark[data-series="seven_day"]')).toHaveLength(1)
    expect(mount([week]).container.querySelectorAll('.MuiLineChart-mark')).toHaveLength(0)
  })
})
