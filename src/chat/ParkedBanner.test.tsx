// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { ParkedBanner } from './ParkedBanner'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const session = (o: Partial<SessionView> = {}): SessionView =>
  ({ id: 's1', slug: 'alpha', desired: 'active', parked_at: '2026-11-02T10:00:00Z', parked_reason: 'stop_loop', parked_detail: { limit: 3 }, ...o }) as unknown as SessionView

const mount = (s: SessionView) =>
  render(
    <ThemeProvider theme={theme}>
      <ParkedBanner session={s} />
    </ThemeProvider>,
  )

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('ParkedBanner', () => {
  test('hidden when not parked or deleting', () => {
    const none = mount(session({ parked_at: null, parked_reason: null, parked_detail: null }))
    expect(none.container.textContent).toBe('')
    none.unmount()
    const deleting = mount(session({ desired: 'deleting' }))
    expect(deleting.container.textContent).toBe('')
  })

  test('shows the reason', () => {
    mount(session())
    expect(screen.getByRole('alert').textContent).toContain('Parked by the runaway guard: Stop hook loop (3 continuations)')
  })

  test('resume calls the park route', async () => {
    const f = vi.fn(async () => json(200, {}))
    vi.stubGlobal('fetch', f)
    mount(session())
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    const calls = f.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('/api/v1/sessions/s1/park')
    expect(calls[0][1].method).toBe('DELETE')
  })

  test('too late when deleting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { error: { code: 'session_deleting', message: 'x' } })))
    mount(session())
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(await screen.findByText('Too late: the session is already being discarded')).toBeTruthy()
  })
})
