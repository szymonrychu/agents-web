// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setViewport } from '../test/viewport'
import { theme } from '../theme'
import { XtermView } from './XtermView'

const fake = vi.hoisted(() => ({
  typed: null as ((data: string) => void) | null,
  focus: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    write() {}
    writeln() {}
    reset() {}
    onData(cb: (d: string) => void) {
      fake.typed = cb
      return { dispose() {} }
    }
    focus() {
      fake.focus()
    }
    dispose() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('./terminalSocket', () => ({
  openTerminalSocket: () => ({ send: fake.send, resize: vi.fn(), close: vi.fn() }),
}))

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver)
  fake.typed = null
  fake.focus.mockReset()
  fake.send.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mount = () => render(<ThemeProvider theme={theme}><XtermView url="ws://x/attach" /></ThemeProvider>)
const type = (data: string) => act(() => fake.typed!(data))
const bar = () => screen.getByRole('toolbar', { name: 'Terminal keys' })

describe('XtermView on touch', () => {
  beforeEach(() => setViewport(375, { coarse: true }))

  test('the key bar sits above the terminal host', () => {
    mount()
    const host = screen.getByTestId('xterm-host')
    expect(bar().compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('Esc sends escape and gives focus back to the terminal', () => {
    mount()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Esc' }))
    expect(fake.send).toHaveBeenCalledWith('\x1b')
    expect(fake.focus).toHaveBeenCalled()
  })

  test('Ctrl is sticky for exactly one key', () => {
    mount()
    const ctrl = within(bar()).getByRole('button', { name: 'Ctrl' })
    fireEvent.click(ctrl)
    expect(ctrl.getAttribute('aria-pressed')).toBe('true')
    type('c')
    expect(fake.send).toHaveBeenLastCalledWith('\x03')
    expect(ctrl.getAttribute('aria-pressed')).toBe('false')
    type('c')
    expect(fake.send).toHaveBeenLastCalledWith('c')
  })

  test('Ctrl then an arrow sends the plain arrow and clears Ctrl', () => {
    mount()
    const ctrl = within(bar()).getByRole('button', { name: 'Ctrl' })
    fireEvent.click(ctrl)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Up' }))
    expect(fake.send).toHaveBeenLastCalledWith('\x1b[A')
    expect(ctrl.getAttribute('aria-pressed')).toBe('false')
    type('c')
    expect(fake.send).toHaveBeenLastCalledWith('c')
  })
})

test('a desktop with a mouse has no key bar and sends typed data unchanged', () => {
  setViewport(1440)
  mount()
  expect(screen.queryByRole('toolbar', { name: 'Terminal keys' })).toBeNull()
  type('c')
  expect(fake.send).toHaveBeenLastCalledWith('c')
})
