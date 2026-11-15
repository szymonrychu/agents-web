// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import CssBaseline from '@mui/material/CssBaseline'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { ThemeProvider } from '@mui/material/styles'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { editorChrome } from './editor/highlight'
import { emittedCss } from './test/emittedCss'
import { theme } from './theme'

// emotion's stylis drops the spaces after colons and commas
const GATE = '@media (pointer:coarse),(hover:none),(max-width:899.95px)'
const compact = (css: string) => css.replace(/\s*([:;{},])\s*/g, '$1')

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
