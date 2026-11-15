import { expect, test } from 'vitest'
import { formatDateTime, formatDateTimeFull } from './dates'

test('formatDateTime is compact and honours the time zone', () => {
  expect(formatDateTime('2026-11-15T10:05:00Z', { timeZone: 'UTC', locale: 'en-GB' })).toBe('15/11/2026, 10:05')
  expect(formatDateTime('2026-11-15T10:05:00Z', { timeZone: 'Europe/Warsaw', locale: 'en-GB' })).toBe('15/11/2026, 11:05')
})

test('an unparsable value is returned unchanged', () => {
  expect(formatDateTime('soon')).toBe('soon')
  expect(formatDateTimeFull('soon')).toBe('soon')
})

test('the full form names the weekday', () => {
  expect(formatDateTimeFull('2026-11-15T10:05:00Z', { timeZone: 'UTC', locale: 'en-GB' })).toContain('Sunday')
})

test('an invalid time zone falls back to the viewer zone instead of throwing', () => {
  const iso = '2026-11-15T10:05:00Z'
  expect(formatDateTime(iso, { timeZone: 'Not/AZone', locale: 'en-GB' })).toBe(formatDateTime(iso, { locale: 'en-GB' }))
  expect(formatDateTimeFull(iso, { timeZone: 'Not/AZone', locale: 'en-GB' })).toBe(formatDateTimeFull(iso, { locale: 'en-GB' }))
})
