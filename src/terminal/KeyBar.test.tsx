// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { theme } from '../theme'
import { KeyBar } from './KeyBar'

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
