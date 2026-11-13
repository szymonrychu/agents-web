// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SessionExpiredBanner } from './SessionExpiredBanner'
import { markSessionExpired, resetSessionExpired } from './session'

afterEach(() => resetSessionExpired())

test('shows the banner with a reload button only after a 401', () => {
  render(<SessionExpiredBanner />)
  expect(screen.queryByText(/Session expired/)).toBeNull()
  act(() => markSessionExpired())
  expect(screen.getByText('Session expired - reload to sign in')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
})
