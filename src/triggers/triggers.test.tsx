// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { FormError, PresetSelect, RunStatusChip, usePoll } from './index'

const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RunStatusChip', () => {
  const cases: [string, string, boolean][] = [
    ['new', 'MuiChip-colorDefault', false],
    ['in-progress', 'MuiChip-colorInfo', false],
    ['handled', 'MuiChip-colorSuccess', false],
    ['ignored', 'MuiChip-colorDefault', true],
    ['failed', 'MuiChip-colorError', false],
  ]
  test.each(cases)('%s renders its color and label', (status, colorClass, outlined) => {
    wrap(<RunStatusChip status={status as 'new'} />)
    const chip = screen.getByLabelText(status)
    expect(chip.className).toContain(colorClass)
    expect(chip.className.includes('MuiChip-outlined')).toBe(outlined)
    expect(chip.textContent).toContain(status)
  })

  test('in-progress has a spinner', () => {
    wrap(<RunStatusChip status="in-progress" />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  test('reason is aria-label and tooltip', async () => {
    wrap(<RunStatusChip status="failed" reason="boom" />)
    const chip = screen.getByLabelText('failed: boom')
    await userEvent.hover(chip)
    expect((await screen.findByRole('tooltip')).textContent).toContain('boom')
  })
})

describe('PresetSelect', () => {
  const presets = [
    { id: 'p1', name: 'Big box', is_default: false },
    { id: 'p2', name: 'Default one', is_default: true },
  ]
  test('lists presets with a default mark', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(presets))
    vi.stubGlobal('fetch', fetchMock)
    wrap(<PresetSelect value="" onChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('combobox').getAttribute('aria-disabled')).not.toBe('true'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/presets')
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: 'Big box' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Default one.*default/ })).toBeTruthy()
  })

  test('calls onChange with the id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(presets)))
    const onChange = vi.fn()
    wrap(<PresetSelect value="" onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole('combobox').getAttribute('aria-disabled')).not.toBe('true'))
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Big box' }))
    expect(onChange).toHaveBeenCalledWith('p1')
  })

  test('shows a loading state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    wrap(<PresetSelect value="" onChange={() => {}} />)
    expect(screen.getByText('Loading presets...')).toBeTruthy()
  })

  test('shows the error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'down', message: 'orchestrator down' } }, 503)))
    wrap(<PresetSelect value="" onChange={() => {}} />)
    expect(await screen.findByText(/orchestrator down/)).toBeTruthy()
  })
})

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  const setVisible = (v: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  test('calls now and every interval, exposes data', async () => {
    const fn = vi.fn().mockResolvedValueOnce('a').mockResolvedValue('b')
    const { result } = renderHook(() => usePoll(fn, 1000, []))
    expect(result.current.loading).toBe(true)
    await act(async () => {})
    expect(result.current.data).toBe('a')
    expect(result.current.loading).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe('b')
  })

  test('exposes errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => usePoll(fn, 1000, []))
    await act(async () => {})
    expect(result.current.error?.message).toBe('x')
  })

  test('pauses while hidden and resumes when visible', async () => {
    const fn = vi.fn().mockResolvedValue(1)
    renderHook(() => usePoll(fn, 1000, []))
    await act(async () => {})
    act(() => setVisible('hidden'))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => { setVisible('visible') })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('never overlaps calls', async () => {
    let resolve: (v: number) => void = () => {}
    let running = 0
    let max = 0
    const fn = vi.fn(() => {
      running++
      max = Math.max(max, running)
      return new Promise<number>((r) => { resolve = (v) => { running--; r(v) } })
    })
    const { result } = renderHook(() => usePoll(fn, 1000, []))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(fn).toHaveBeenCalledTimes(1)
    act(() => { void result.current.refresh() })
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(1) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(max).toBe(1)
  })

  test('a deps change discards the in-flight result and fetches for the new deps', async () => {
    const resolvers: Record<string, (v: string) => void> = {}
    const fn = vi.fn((range: string) => new Promise<string>((r) => { resolvers[range] = r }))
    const { result, rerender } = renderHook(({ range }) => usePoll(() => fn(range), 60000, [range]), { initialProps: { range: '24h' } })
    await act(async () => {})
    expect(fn).toHaveBeenCalledTimes(1)
    rerender({ range: '7d' })
    await act(async () => {})
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('7d')
    await act(async () => { resolvers['24h']('old') })
    expect(result.current.data).toBeUndefined()
    expect(result.current.loading).toBe(true)
    await act(async () => { resolvers['7d']('new') })
    expect(result.current.data).toBe('new')
    expect(result.current.loading).toBe(false)
  })

  test('stops on unmount', async () => {
    const fn = vi.fn().mockResolvedValue(1)
    const { unmount } = renderHook(() => usePoll(fn, 1000, []))
    await act(async () => {})
    unmount()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('FormError', () => {
  test('shows code and message of a backend error', () => {
    wrap(<FormError error={{ error: { code: 'bad_input', message: 'name is required' } }} />)
    expect(screen.getByRole('alert').textContent).toContain('bad_input')
    expect(screen.getByRole('alert').textContent).toContain('name is required')
  })
  test('shows a network error', () => {
    wrap(<FormError error={new TypeError('Failed to fetch')} />)
    expect(screen.getByRole('alert').textContent).toContain('Failed to fetch')
  })
  test('renders nothing without an error', () => {
    wrap(<FormError error={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
