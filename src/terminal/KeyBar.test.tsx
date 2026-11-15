// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { theme } from '../theme'
import { KeyBar, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS } from './KeyBar'

afterEach(cleanup)

function mount(ctrl = false) {
  const onCtrl = vi.fn()
  const onKey = vi.fn()
  render(<ThemeProvider theme={theme}><KeyBar ctrl={ctrl} onCtrl={onCtrl} onKey={onKey} /></ThemeProvider>)
  return { onCtrl, onKey, bar: screen.getByRole('toolbar', { name: 'Terminal keys' }) }
}

test('keys send their sequences', () => {
  const { onKey, bar } = mount()
  fireEvent.click(within(bar).getByRole('button', { name: 'Esc' }))
  fireEvent.click(within(bar).getByRole('button', { name: 'Up' }))
  fireEvent.click(within(bar).getByRole('button', { name: 'Tab' }))
  fireEvent.click(within(bar).getByRole('button', { name: 'Down' }))
  fireEvent.click(within(bar).getByRole('button', { name: 'Left' }))
  fireEvent.click(within(bar).getByRole('button', { name: 'Right' }))
  expect(onKey.mock.calls.map((c) => c[0])).toEqual(['\x1b', '\x1b[A', '\t', '\x1b[B', '\x1b[D', '\x1b[C'])
})

test('Ctrl toggles and shows its pressed state', () => {
  const { onCtrl, bar } = mount()
  const ctrl = within(bar).getByRole('button', { name: 'Ctrl' })
  expect(ctrl.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(ctrl)
  expect(onCtrl).toHaveBeenCalledWith(true)
  cleanup()
  const second = mount(true)
  const pressed = within(second.bar).getByRole('button', { name: 'Ctrl' })
  expect(pressed.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(pressed)
  expect(second.onCtrl).toHaveBeenCalledWith(false)
})

test('pressing a key does not take focus from the terminal', () => {
  const { bar } = mount()
  for (const name of ['Esc', 'Ctrl', 'Up']) {
    const button = within(bar).getByRole('button', { name })
    const down = createEvent.mouseDown(button)
    fireEvent(button, down)
    expect(down.defaultPrevented).toBe(true)
    const pointer = createEvent.pointerDown(button)
    fireEvent(button, pointer)
    expect(pointer.defaultPrevented).toBe(true)
  }
})

test('the bar scrolls sideways', () => {
  const { bar } = mount()
  expect(emittedCssFor(bar)).toContain('overflow-x:auto')
})

describe('holding an arrow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('repeats while held, stops on release and the release click adds nothing', () => {
    const { onKey, bar } = mount()
    const up = within(bar).getByRole('button', { name: 'Up' })
    fireEvent.pointerDown(up)
    vi.advanceTimersByTime(REPEAT_DELAY_MS - 1)
    expect(onKey).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1 + 2 * REPEAT_INTERVAL_MS)
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(['\x1b[A', '\x1b[A', '\x1b[A'])
    fireEvent.pointerUp(up)
    fireEvent.click(up)
    vi.advanceTimersByTime(10 * REPEAT_INTERVAL_MS)
    expect(onKey).toHaveBeenCalledTimes(3)
  })

  test('a short tap sends one key', () => {
    const { onKey, bar } = mount()
    const left = within(bar).getByRole('button', { name: 'Left' })
    fireEvent.pointerDown(left)
    fireEvent.pointerUp(left)
    fireEvent.click(left)
    vi.advanceTimersByTime(10 * REPEAT_DELAY_MS)
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(['\x1b[D'])
  })

  test('leaving or cancelling the press stops the repeat', () => {
    const { onKey, bar } = mount()
    const down = within(bar).getByRole('button', { name: 'Down' })
    fireEvent.pointerDown(down)
    vi.advanceTimersByTime(REPEAT_DELAY_MS)
    fireEvent.pointerCancel(down)
    vi.advanceTimersByTime(10 * REPEAT_INTERVAL_MS)
    expect(onKey).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(down)
    vi.advanceTimersByTime(REPEAT_DELAY_MS)
    fireEvent.pointerLeave(down)
    vi.advanceTimersByTime(10 * REPEAT_INTERVAL_MS)
    expect(onKey).toHaveBeenCalledTimes(2)
  })

  test('Esc and Tab do not repeat', () => {
    const { onKey, bar } = mount()
    const esc = within(bar).getByRole('button', { name: 'Esc' })
    fireEvent.pointerDown(esc)
    vi.advanceTimersByTime(10 * REPEAT_DELAY_MS)
    expect(onKey).not.toHaveBeenCalled()
  })
})
