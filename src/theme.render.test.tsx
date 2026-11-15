// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import Dialog from '@mui/material/Dialog'
import CssBaseline from '@mui/material/CssBaseline'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { editorChrome } from './editor/highlight'
import { emittedCss, emittedCssFor, emittedInMedia } from './test/emittedCss'
import { setViewport } from './test/viewport'
import { theme } from './theme'

// emotion's stylis drops the spaces after colons and commas
const GATE = '@media (pointer:coarse),(hover:none),(max-width:899.95px)'
const compact = (css: string) => css.replace(/\s*([:;{},])\s*/g, '$1')

afterEach(cleanup)

describe('no-zoom floor in emitted CSS', () => {
  it('emits the gated 16 px rules for inputs, selects, editors and the terminal textarea', () => {
    render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <TextField label="x" />
        <TextField select value="" label="y">
          <MenuItem value="">none</MenuItem>
        </TextField>
      </ThemeProvider>,
    )
    const css = compact(emittedCss())
    expect(css).toMatch(/@media \(pointer:coarse\),\(hover:none\),\(max-width:899\.95px\)\{[^}]*\.xterm \.xterm-helper-textarea\{font-size:16px!important/)
    expect(css).toContain('.cm-content')
    expect(css).toMatch(/max-width:899\.95px\)\{\.css-[\w-]*InputBase-root[\w-]*\{font-size:1rem;/)
  })

  it('the CodeMirror theme mounts the gated rule', () => {
    const view = new EditorView({ parent: document.body, extensions: [editorChrome] })
    const css = compact(emittedCss())
    view.destroy()
    expect(css).toContain(GATE)
  })
})

describe('dialogs on phones in emitted CSS', () => {
  it('a fullWidth Dialog gets the phone full-screen rule after the scroll and width rules it must beat', () => {
    render(
      <ThemeProvider theme={theme}>
        <Dialog open fullWidth>
          <div>a</div>
        </Dialog>
        <Dialog open>
          <div>b</div>
        </Dialog>
      </ThemeProvider>,
    )
    const css = compact(emittedCss())
    expect(css).toContain('@media (max-width:599.95px){')
    expect(css).toContain('env(safe-area-inset-bottom)')
    const paper = document.querySelectorAll('.MuiDialog-paper')
    expect(paper).toHaveLength(2)
    const block = compact(emittedCssFor(paper[0]))
    // in one class the phone full-screen declarations come after each base rule they override
    for (const [base, win] of [
      ['max-height:calc(100% - 64px)', 'max-height:100%'],
      ['max-width:600px', 'max-width:100%'],
      ['margin:32px', 'margin:16px'],
      ['margin:16px', 'margin:0'],
    ]) {
      expect(block.indexOf(base), base).toBeGreaterThanOrEqual(0)
      expect(block.lastIndexOf(win), win).toBeGreaterThan(block.indexOf(base))
    }
    // the plain dialog keeps its own maxWidth: no 100% override
    const plain = compact(emittedCssFor(paper[1]))
    expect(plain).not.toMatch(/max-width:100%/)
  })

  it('a fullScreen Dialog without fullWidth resets margin and maxWidth after the gutter rule', () => {
    render(
      <ThemeProvider theme={theme}>
        <Dialog open fullScreen>
          <div>c</div>
        </Dialog>
      </ThemeProvider>,
    )
    const el = document.querySelector('.MuiDialog-paper')!
    const block = compact(emittedCssFor(el))
    expect(block.lastIndexOf('margin:0')).toBeGreaterThan(block.indexOf('margin:16px'))
    expect(block).toMatch(/max-width:100%/)
  })
})

describe('switch on a touch device', () => {
  it.each([['medium', undefined], ['small', 'small' as const]])(
    'the switch base stays absolutely positioned under (pointer: coarse), %s',
    (_name, size) => {
      setViewport(375, { coarse: true })
      const { container } = render(
        <ThemeProvider theme={theme}>
          <Switch size={size} slotProps={{ input: { 'aria-label': 'x' } }} />
        </ThemeProvider>,
      )
      const base = container.querySelector('.MuiSwitch-switchBase')!
      expect(emittedInMedia(base, '(pointer: coarse)')).toContain('content:""')
      // the declarations before the ::after hit box: the last position set on the base itself must be absolute
      const own = compact(emittedCssFor(base))
      const before = own.slice(0, own.indexOf('content:""'))
      expect(before.match(/position:(\w+)/g)?.at(-1)).toBe('position:absolute')
    },
  )
})
