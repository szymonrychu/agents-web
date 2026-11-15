// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { theme } from '../theme'
import { DateTime } from './DateTime'
import { formatDateTime, formatDateTimeFull } from './dates'

afterEach(cleanup)

const ISO = '2026-11-15T10:05:00Z'
const mount = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)

test('renders a time element with the compact text and the full form as title', () => {
  const { container } = mount(<DateTime iso={ISO} />)
  const time = container.querySelector('time')
  expect(time).not.toBeNull()
  expect(time!.getAttribute('dateTime')).toBe(ISO)
  expect(time!.getAttribute('title')).toBe(formatDateTimeFull(ISO))
  expect(time!.textContent).toBe(formatDateTime(ISO))
  expect(emittedCssFor(time!)).toContain('white-space:nowrap')
})

test('the time zone reaches both forms', () => {
  const { container } = mount(<DateTime iso={ISO} timeZone="Europe/Warsaw" />)
  const time = container.querySelector('time')!
  expect(time.textContent).toBe(formatDateTime(ISO, { timeZone: 'Europe/Warsaw' }))
  expect(time.getAttribute('title')).toBe(formatDateTimeFull(ISO, { timeZone: 'Europe/Warsaw' }))
})

test('an empty value renders the fallback', () => {
  const { container } = mount(<DateTime iso={null} />)
  expect(container.querySelector('time')).toBeNull()
  expect(screen.getByText('-')).toBeTruthy()
  cleanup()
  mount(<DateTime iso={undefined} fallback="never" />)
  expect(screen.getByText('never')).toBeTruthy()
})
