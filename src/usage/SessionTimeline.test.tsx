// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import type { MarkView } from './api'
import { MARGIN, PLOT_LEFT } from './chartLayout'
import { ORIGIN_COLORS } from './chartModel'
import { SessionTimeline } from './SessionTimeline'

const FROM = new Date('2026-11-01T00:00:00Z')
const TO = new Date('2026-11-02T00:00:00Z')
const NOW = new Date('2026-11-01T12:00:00Z')
const mark = (o: Partial<MarkView> = {}): MarkView => ({
  session_id: 's-1', slug: 'alpha', preset_id: 'p-1', preset_name: 'fast', origin: 'ui', started_at: '2026-11-01T06:00:00Z', ended_at: '2026-11-01T12:00:00Z', ...o,
})
const mount = (marks: MarkView[]) => render(<ThemeProvider theme={theme}><SessionTimeline marks={marks} from={FROM} to={TO} now={NOW} /></ThemeProvider>)
const bar = (id: string) => screen.getByTestId(`session-bar-${id}`)

afterEach(cleanup)

describe('SessionTimeline', () => {
  test('one bar per mark with the origin colour', () => {
    mount([mark({ session_id: 'a', origin: 'ui' }), mark({ session_id: 'b', origin: 'webhook' }), mark({ session_id: 'c', origin: 'schedule' })])
    expect(screen.getAllByTestId(/^session-bar-/)).toHaveLength(3)
    expect(bar('a').getAttribute('fill')).toBe(ORIGIN_COLORS.ui)
    expect(bar('b').getAttribute('fill')).toBe(ORIGIN_COLORS.webhook)
    expect(bar('c').getAttribute('fill')).toBe(ORIGIN_COLORS.schedule)
  })

  test('an unknown origin falls back to the other colour', () => {
    mount([mark({ session_id: 'a', origin: 'something-new' })])
    expect(bar('a').getAttribute('fill')).toBe(ORIGIN_COLORS.other)
  })

  test('bars are positioned by percentage of the plot width, inside the chart margins', () => {
    mount([mark({ session_id: 'a' })])
    expect(bar('a').getAttribute('x')).toBe('25%')
    expect(bar('a').getAttribute('width')).toBe('25%')
    const style = getComputedStyle(screen.getByTestId('session-timeline'))
    expect(style.paddingLeft).toBe(`${PLOT_LEFT}px`)
    expect(style.paddingRight).toBe(`${MARGIN.right}px`)
  })

  test('overlapping sessions take separate lanes', () => {
    mount([mark({ session_id: 'a' }), mark({ session_id: 'b', started_at: '2026-11-01T08:00:00Z' })])
    expect(bar('a').getAttribute('y')).toBe('0')
    expect(bar('b').getAttribute('y')).toBe('14')
    expect(screen.getByRole('img', { name: 'Sessions over time' }).getAttribute('height')).toBe('28')
  })

  test('an open session reaches now', () => {
    mount([mark({ session_id: 'a', ended_at: null })])
    expect(bar('a').getAttribute('x')).toBe('25%')
    expect(bar('a').getAttribute('width')).toBe('25%')
  })

  test('hover shows slug, preset, origin and start; a running session says running', async () => {
    mount([mark({ session_id: 'a', ended_at: null })])
    await userEvent.hover(bar('a'))
    const tip = await screen.findByRole('tooltip')
    for (const part of ['alpha', 'fast', 'ui', '2026-11-01 06:00 UTC', 'running']) expect(tip.textContent).toContain(part)
  })

  test('hover on a closed session shows its end', async () => {
    mount([mark({ session_id: 'a' })])
    await userEvent.hover(bar('a'))
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent).toContain('2026-11-01 06:00 UTC - 2026-11-01 12:00 UTC')
  })

  test('no marks shows an empty lane message', () => {
    mount([])
    expect(screen.getByText('No sessions in this range')).toBeTruthy()
    expect(screen.queryByTestId('session-timeline')).toBeNull()
  })
})
