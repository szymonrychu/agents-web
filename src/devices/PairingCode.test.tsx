// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { PairingCode, formatCode, formatCountdown } from './PairingCode'

const mount = (props: Partial<React.ComponentProps<typeof PairingCode>> = {}) =>
  render(<ThemeProvider theme={theme}><PairingCode code="123456" expiresIn={65} locked={false} busy={false} onNewCode={() => {}} {...props} /></ThemeProvider>)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PairingCode', () => {
  test('formats the code as 3+3 and the countdown as mm:ss', () => {
    expect(formatCode('123456')).toBe('123 456')
    expect(formatCountdown(65)).toBe('01:05')
    expect(formatCountdown(0)).toBe('00:00')
  })

  test('counts down from expiresIn and shows expiry at zero', () => {
    mount()
    expect(screen.getByText('01:05')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(screen.getByText('01:00')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText(/code expired/i)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
    expect(screen.getByRole('button', { name: 'New code' })).toBeTruthy()
  })

  test('a new code prop restarts the countdown', () => {
    const view = mount()
    act(() => { vi.advanceTimersByTime(30_000) })
    view.rerender(<ThemeProvider theme={theme}><PairingCode code="654321" expiresIn={600} locked={false} busy={false} onNewCode={() => {}} /></ThemeProvider>)
    expect(screen.getByText('10:00')).toBeTruthy()
  })

  test('locked shows the lock message instead of the code', () => {
    mount({ locked: true })
    expect(screen.getByText(/too many wrong attempts, generate a new code/i)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing code')).toBeNull()
  })
})
