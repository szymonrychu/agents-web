// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SessionExpiredBanner } from './SessionExpiredBanner'
import { markSessionExpired, resetSessionExpired } from './session'
import { emittedCssFor } from '../test/emittedCss'

afterEach(() => {
  cleanup()
  resetSessionExpired()
})

test('shows the banner with a reload button only after a 401', () => {
  render(<SessionExpiredBanner />)
  expect(screen.queryByText(/Session expired/)).toBeNull()
  act(() => markSessionExpired())
  expect(screen.getByText('Session expired - reload to sign in')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
})

test('keeps the banner below the notch and inside the side insets', () => {
  act(() => markSessionExpired())
  render(<SessionExpiredBanner />)
  const css = emittedCssFor(screen.getByRole('alert'))
  expect(css).toContain('env(safe-area-inset-top)')
  expect(css).toContain('env(safe-area-inset-left)')
  expect(css).toContain('env(safe-area-inset-right)')
})
