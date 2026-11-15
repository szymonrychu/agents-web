// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { CredentialNotice } from './CredentialNotice'

const client = vi.hoisted(() => ({ getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const E = '2027-10-23T00:00:00Z'
const meta = (phase: string) => ({ credential: { expires_at: E, phase, warn_days: 10, refuse_hours: 24 } })
const mount = () => render(<ThemeProvider theme={theme}><CredentialNotice /></ThemeProvider>)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.parse(E) - 9 * 86400000)
  client.getMeta.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CredentialNotice', () => {
  test('warn is a status line', async () => {
    client.getMeta.mockResolvedValue(meta('warn'))
    mount()
    expect((await screen.findByRole('status')).textContent).toBe('Claude credential ends 2027-10-23 00:00 UTC (in 9 days)')
  })
  test('expired is an alert', async () => {
    client.getMeta.mockResolvedValue(meta('expired'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Claude credential ended 2027-10-23 00:00 UTC')
  })
  test('ok renders nothing', async () => {
    client.getMeta.mockResolvedValue(meta('ok'))
    mount()
    await vi.waitFor(() => expect(client.getMeta).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
