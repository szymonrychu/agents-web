// @vitest-environment jsdom
import Dialog from '@mui/material/Dialog'
import Drawer from '@mui/material/Drawer'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { emittedCss, emittedInMedia } from '../test/emittedCss'
import { TOUCH_OR_SMALL_QUERY, theme } from '../theme'

// MUI portals render to body as position:fixed against the layout viewport, which iOS does not shrink for the
// keyboard; useVisualViewport's --app-top / --app-height keep them on the visible area.
afterEach(cleanup)

const VISIBLE = ['top:var(--app-top,0px)', 'bottom:auto', 'height:var(--app-height,100%)']
const root = (cls: string) => document.body.querySelector(cls)!

test('a form dialog sits on the visible area on touch or small viewports', () => {
  render(<ThemeProvider theme={theme}><Dialog open fullWidth><TextField label="Name" /></Dialog></ThemeProvider>)
  const css = emittedInMedia(root('.MuiDialog-root'), TOUCH_OR_SMALL_QUERY)
  for (const decl of VISIBLE) expect(css).toContain(decl)
})

test('a temporary drawer sits on the visible area and is the containing block of its fixed paper', () => {
  render(<ThemeProvider theme={theme}><Drawer anchor="bottom" open>panel</Drawer></ThemeProvider>)
  const css = emittedInMedia(root('.MuiDrawer-modal'), TOUCH_OR_SMALL_QUERY)
  for (const decl of [...VISIBLE, 'transform:translateZ(0)']) expect(css).toContain(decl)
})

test('the variables are used only behind the gate, so desktop modals are unchanged', () => {
  render(<ThemeProvider theme={theme}><Dialog open fullWidth>x</Dialog><Drawer open>y</Drawer></ThemeProvider>)
  const gate = `@media ${TOUCH_OR_SMALL_QUERY.replace(/\s*([:,])\s*/g, '$1')}{`
  const css = emittedCss().replace(/\s*([:;{},])\s*/g, '$1')
  const outside = css.split(gate).map((part, i) => (i === 0 ? part : part.slice(part.indexOf('}}') + 2))).join('')
  expect(css).toContain('var(--app-top,0px)')
  expect(outside).not.toContain('--app-')
})

test('a menu keeps its root on the layout viewport, where its anchor rect is measured', () => {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  render(<ThemeProvider theme={theme}><Menu open anchorEl={anchor}><MenuItem>One</MenuItem></Menu></ThemeProvider>)
  expect(emittedInMedia(root('.MuiPopover-root'), TOUCH_OR_SMALL_QUERY)).not.toContain('--app-')
  anchor.remove()
})
