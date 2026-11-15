// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import Dialog from '@mui/material/Dialog'
import CssBaseline from '@mui/material/CssBaseline'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { editorChrome } from './editor/highlight'
import { emittedCss } from './test/emittedCss'
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
    expect(css).toContain(GATE)
    expect(css).toContain('font-size:16px!important')
    expect(css).toContain('.xterm .xterm-helper-textarea')
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
    const phone = '@media (max-width:599.95px){'
    expect(css).toContain(phone)
    expect(css).toMatch(/@media \(max-width:599\.95px\)\{[^}]*max-height:100%/)
    expect(css).toContain('env(safe-area-inset-bottom)')
    const paper = document.querySelectorAll('.MuiDialog-paper')
    expect(paper).toHaveLength(2)
    // the full-screen rule is emitted in the same class as paperFullWidth and after its base max-height rule
    const full = paper[0].className.split(' ').find((c) => c.startsWith('css-'))!
    const block = css.slice(css.indexOf(`.${full}`))
    expect(block.indexOf('max-height:calc(100% - 64px)')).toBeGreaterThanOrEqual(0)
    expect(block.indexOf('max-height:calc(100% - 64px)')).toBeLessThan(block.indexOf('max-height:100%'))
  })
})
