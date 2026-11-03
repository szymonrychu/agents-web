// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { ClosingBanner } from './ClosingBanner'

const NOW = new Date('2026-11-02T10:02:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const session = (o: Partial<SessionView> = {}): SessionView =>
  ({ id: 's1', slug: 'alpha', desired: 'active', close_requested_at: '2026-11-02T10:00:00Z', close_reason: 'done', ...o }) as unknown as SessionView

const mount = (s: SessionView) =>
  render(
    <ThemeProvider theme={theme}>
      <ClosingBanner session={s} />
    </ThemeProvider>,
  )

const keep = () => screen.getByRole('button', { name: 'Keep session' }) as HTMLButtonElement
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('ClosingBanner', () => {
  test('hidden without a request or while deleting', () => {
    const none = mount(session({ close_requested_at: null, close_reason: null }))
    expect(none.container.textContent).toBe('')
    none.unmount()
    const deleting = mount(session({ desired: 'deleting' }))
    expect(deleting.container.textContent).toBe('')
  })

  test('shows reason and age', () => {
    mount(session())
    expect(screen.getByRole('alert').textContent).toContain('Closing when idle, requested 2m ago: done')
    expect(keep()).toBeTruthy()
  })

  test('omits the colon without a reason', () => {
    mount(session({ close_reason: null }))
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('Closing when idle, requested 2m ago')
    expect(text).not.toContain(':')
  })

  test('keep session cancels', async () => {
    let done!: () => void
    const f = vi.fn(() => new Promise<Response>((r) => (done = () => r(json(200, {})))))
    vi.stubGlobal('fetch', f)
    mount(session())
    await act(async () => fireEvent.click(keep()))
    expect(keep().disabled).toBe(true)
    await act(async () => done())
    expect(keep().disabled).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    const calls = f.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('/api/v1/sessions/s1/close')
    expect(calls[0][1].method).toBe('DELETE')
  })

  test('too late on 409', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { error: { code: 'session_deleting', message: 'session is deleting' } })))
    mount(session())
    await act(async () => fireEvent.click(keep()))
    expect(screen.getByText('Too late: the session is already being discarded')).toBeTruthy()
  })

  test('other errors show the API message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { error: { message: 'boom' } })))
    mount(session())
    await act(async () => fireEvent.click(keep()))
    expect(screen.getByText('boom')).toBeTruthy()
  })

  test('shows the inactivity deadline', async () => {
    const f = vi.fn(async () => json(200, {}))
    vi.stubGlobal('fetch', f)
    mount(session({ close_kind: 'inactivity', close_deadline_at: '2026-11-02T14:05:00Z', close_reason: 'quiet for 4 h' }))
    expect(screen.getByRole('alert').textContent).toContain('Closing for inactivity at 14:05Z: quiet for 4 h')
    await act(async () => fireEvent.click(keep()))
    expect(f).toHaveBeenCalledTimes(1)
    const calls = f.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('/api/v1/sessions/s1/close')
    expect(calls[0][1].method).toBe('DELETE')
  })

  test('self-close banner unchanged', () => {
    mount(session({ close_kind: 'self', close_deadline_at: null }))
    expect(screen.getByRole('alert').textContent).toContain('Closing when idle, requested 2m ago: done')
  })

  test('reason is plain text', () => {
    const { container } = mount(session({ close_reason: '<b>x</b>' }))
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('<b>x</b>')
  })
})
