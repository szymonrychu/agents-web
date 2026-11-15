import { describe, expect, it } from 'vitest'
import { editorChromeSpec } from './editor/highlight'
import {
  CANVAS_BG,
  CONTROL_PX,
  MONO_FONT,
  NO_ZOOM_INPUT_PX,
  NO_ZOOM_SELECTOR,
  PANEL_BG,
  PHONE,
  TOKENS,
  TOUCH_OR_SMALL,
  TOUCH_TARGET_PX,
  hitArea44,
  hitBox44,
  terminalTheme,
  theme,
} from './theme'
import { safeInset } from './layout/safeArea'

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comp = theme.components as any
const COARSE = '@media (pointer: coarse)'

describe('TOKENS', () => {
  it('theme uses the dark ported tokens', () => {
    expect(theme.palette.mode).toBe('dark')
    expect(theme.palette.background.default).toBe('#0f1013')
    expect(theme.palette.primary.main).toBe('#e8eaed')
    expect(theme.shape.borderRadius).toBe(2)
    expect(TOKENS.touchTargetPx).toBe(44)
  })

  it('has the surface, border, text and state values', () => {
    expect(TOKENS).toMatchObject({
      bgCanvas: '#0f1013', bgPanel: '#16181d', bgRaised: '#1d2026',
      border: '#2a2e36', borderStrong: '#3a3f49',
      textPrimary: '#d6d9de', textSecondary: '#8d939c', textDisabled: '#5a6069',
      error: '#e5484d', warning: '#e2a336',
      radius: 2, borderWidth: 1, panelHeaderPx: 32, controlPx: 32, touchTargetPx: 44,
      fontSizes: { xs: 11, sm: 12, md: 13, lg: 14, xl: 16 },
      fontWeights: { regular: 400, medium: 500 },
    })
    expect(TOKENS.fontWeights).toEqual({ regular: 400, medium: 500 })
    expect('ok' in TOKENS).toBe(false)
  })

  it('accent is a neutral light grey and accentText is dark', () => {
    const [r, g, b] = channels(TOKENS.accent)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8)
    expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0xd0)
    expect(Math.max(...channels(TOKENS.accentText))).toBeLessThanOrEqual(0x30)
  })
})

describe('MUI palette', () => {
  const p = theme.palette
  it('maps tokens', () => {
    expect(p.mode).toBe('dark')
    expect(p.primary.main).toBe(TOKENS.accent)
    expect(p.secondary.main).toBe(TOKENS.textSecondary)
    expect(p.info.main).toBe(TOKENS.textSecondary)
    expect(p.success.main).toBe(TOKENS.textPrimary)
    expect(p.error.main).toBe(TOKENS.error)
    expect(p.warning.main).toBe(TOKENS.warning)
    expect(p.background.default).toBe(TOKENS.bgCanvas)
    expect(p.background.paper).toBe(TOKENS.bgPanel)
    expect(p.divider).toBe(TOKENS.border)
    expect(p.text.primary).toBe(TOKENS.textPrimary)
    expect(p.text.secondary).toBe(TOKENS.textSecondary)
    expect(p.text.disabled).toBe(TOKENS.textDisabled)
    expect(theme.shape.borderRadius).toBe(2)
  })
})

describe('typography', () => {
  // Inputs are no longer 13 px on touch and small viewports (spec 4.1, decision Q1); 13 px still holds for typography.fontSize and body1.
  it('keeps compact 13 px for non-input text, system font, weights 400/500', () => {
    const t = theme.typography
    expect(t.fontSize).toBe(13)
    expect(t.fontFamily).not.toMatch(/https?:|@font-face/)
    expect(MONO_FONT).toContain('monospace')
    const variants = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'subtitle1', 'subtitle2', 'body1', 'body2', 'button', 'caption', 'overline'] as const
    for (const v of variants) expect([400, 500]).toContain(t[v].fontWeight)
    expect(t.overline.textTransform).toBe('none')
    expect(t.overline.letterSpacing).toBe(0)
    expect(t.button.textTransform).toBe('none')
  })
})

describe('component overrides', () => {
  it('Chip, Alert, Paper', () => {
    expect(comp.MuiChip.defaultProps).toMatchObject({ variant: 'outlined', size: 'small' })
    expect(comp.MuiChip.styleOverrides.root.borderRadius).toBe(2)
    expect(comp.MuiAlert.defaultProps.variant).toBe('outlined')
    expect(comp.MuiAlert.styleOverrides.root).toMatchObject({ borderRadius: 2, borderLeftWidth: 3 })
    expect(comp.MuiPaper.defaultProps.elevation).toBe(0)
    expect(comp.MuiPaper.styleOverrides.root).toMatchObject({
      backgroundImage: 'none',
      border: `1px solid ${TOKENS.border}`,
    })
  })

  it('Button and IconButton are 44 px on coarse pointers and 32 px otherwise', () => {
    expect(comp.MuiButton.defaultProps.disableElevation).toBe(true)
    for (const name of ['MuiButton', 'MuiIconButton']) {
      const root = comp[name].styleOverrides.root
      expect(root.minHeight).toBe(CONTROL_PX)
      expect(root.minWidth).toBe(CONTROL_PX)
      expect(root[COARSE]).toMatchObject({ minHeight: TOUCH_TARGET_PX, minWidth: TOUCH_TARGET_PX })
    }
  })

  it('Tooltip, Tab, LinearProgress', () => {
    expect(comp.MuiTooltip.styleOverrides.tooltip).toMatchObject({ fontSize: 11, backgroundColor: TOKENS.bgRaised })
    expect(comp.MuiTooltip.styleOverrides.tooltip.border).toContain(TOKENS.border)
    expect(comp.MuiTab.styleOverrides.root).toMatchObject({ minHeight: 40, fontWeight: 500 })
    expect(comp.MuiTabs.styleOverrides.indicator.backgroundColor).toBe(TOKENS.accent)
    expect(comp.MuiLinearProgress.styleOverrides.root).toMatchObject({ height: 2, borderRadius: 0 })
  })

  it('CssBaseline sets tabular numbers and canvas background', () => {
    const css = comp.MuiCssBaseline.styleOverrides
    expect(css.body.fontVariantNumeric).toBe('tabular-nums')
    expect(css.body.backgroundColor).toBe(TOKENS.bgCanvas)
  })

  it('CssBaseline pins text size adjust explicitly', () => {
    expect(comp.MuiCssBaseline.styleOverrides.html).toMatchObject({ WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' })
  })

  it('CssBaseline forces 16 px on every focusable text surface on touch and small viewports', () => {
    expect(comp.MuiCssBaseline.styleOverrides[TOUCH_OR_SMALL][NO_ZOOM_SELECTOR].fontSize).toBe('16px !important')
    for (const part of [
      'textarea', 'select', '[contenteditable]', '.cm-editor', '.cm-content', '.xterm-helper-textarea',
      'input:not([type=checkbox])', ':not([type=radio])', ':not([type=range])', ':not([type=file])', ':not([type=hidden])',
    ]) {
      expect(NO_ZOOM_SELECTOR).toContain(part)
    }
  })

  it('InputBase is 1rem on touch and small viewports and keeps body1 13 px elsewhere', () => {
    const { root, input } = comp.MuiInputBase.styleOverrides
    expect(root[TOUCH_OR_SMALL]).toEqual({ fontSize: '1rem' })
    expect(input[TOUCH_OR_SMALL]).toEqual({ fontSize: '1rem' })
    expect(root).not.toHaveProperty('fontSize')
    expect(input).not.toHaveProperty('fontSize')
  })
})

describe('dialogs on phones', () => {
  it('PHONE is the down(sm) media query', () => {
    expect(PHONE).toBe(theme.breakpoints.down('sm'))
  })

  it('a fullWidth Dialog is full screen on phones and clears the safe areas', () => {
    expect(comp.MuiDialog.styleOverrides.paperFullWidth[PHONE]).toMatchObject({
      margin: 0, width: '100%', maxWidth: '100%', height: '100%', maxHeight: '100%', borderRadius: 0,
      paddingTop: safeInset('top'), paddingBottom: safeInset('bottom'), paddingLeft: safeInset('left'), paddingRight: safeInset('right'),
    })
  })

  it('other Dialogs keep a 16 px gutter on phones and their own maxWidth', () => {
    expect(comp.MuiDialog.styleOverrides.paper[PHONE]).toEqual({ margin: '16px' })
  })

  it('a fullScreen Dialog without fullWidth resets the gutter on phones', () => {
    expect(comp.MuiDialog.styleOverrides.paperFullScreen[PHONE]).toMatchObject({ margin: 0, maxWidth: '100%' })
  })
})

describe('modal surfaces follow the visual viewport', () => {
  const visible = { top: 'var(--app-top, 0px)', bottom: 'auto', height: 'var(--app-height, 100%)' }

  it('the Dialog root is sized to the visible area only on touch or small viewports', () => {
    expect(comp.MuiDialog.styleOverrides.root).toEqual({ [TOUCH_OR_SMALL]: visible })
  })

  it('the temporary Drawer root is sized to the visible area and holds its fixed paper', () => {
    expect(comp.MuiDrawer.styleOverrides.modal).toEqual({ [TOUCH_OR_SMALL]: { ...visible, transform: 'translateZ(0)' } })
  })
})

describe('exported constants', () => {
  it('are opaque token aliases', () => {
    expect(CANVAS_BG).toBe(TOKENS.bgCanvas)
    expect(PANEL_BG).toBe(TOKENS.bgPanel)
    expect(TOUCH_TARGET_PX).toBe(44)
    expect(CONTROL_PX).toBe(32)
  })

  it('define the no-zoom floor and its media gate', () => {
    expect(NO_ZOOM_INPUT_PX).toBe(16)
    expect(TOUCH_OR_SMALL).toBe('@media (pointer: coarse), (hover: none), (max-width: 899.95px)')
  })

  it('the editor chrome carries the same floor', () => {
    expect(editorChromeSpec[TOUCH_OR_SMALL]).toEqual({ '&': { fontSize: '1rem' } })
    expect(editorChromeSpec['&'].fontSize).toBe('0.8125rem')
  })
})

describe('terminalTheme', () => {
  it('colours the xterm screen from the dashboard tokens and defines the 16 ANSI colours', () => {
    expect(terminalTheme.background).toBe(TOKENS.bgCanvas)
    expect(terminalTheme.foreground).toBe(TOKENS.textPrimary)
    const ansi = Object.entries(terminalTheme).filter(([k]) => !['background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground'].includes(k))
    expect(ansi).toHaveLength(16)
    for (const [, v] of ansi) expect(v).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('44px touch targets on coarse pointers', () => {
  const so = (name: string) => comp[name].styleOverrides

  it('toggle buttons, tabs and list buttons grow only under COARSE', () => {
    expect(so('MuiToggleButton').root[COARSE]).toMatchObject({ minHeight: 44 })
    expect(so('MuiTab').root.minHeight).toBe(40)
    expect(so('MuiTab').root[COARSE].minHeight).toBe(48)
    expect(so('MuiListItemButton').root[COARSE].minHeight).toBe(44)
  })

  it('checkbox, radio and switch get a 44px hit box', () => {
    expect(so('MuiCheckbox').root[COARSE]).toMatchObject({ minWidth: 44, minHeight: 44 })
    expect(so('MuiRadio').root[COARSE]).toMatchObject({ minWidth: 44, minHeight: 44 })
    // the Switch base is absolutely positioned by MUI: a position here would break the thumb
    expect(so('MuiSwitch').switchBase[COARSE]).not.toHaveProperty('position')
    expect(so('MuiSwitch').switchBase[COARSE]['&::after']).toEqual(hitArea44['&::after'])
    expect(hitArea44).toEqual({ position: 'relative', ...hitBox44 })
  })

  it('clickable chips get the invisible hit area, the root stays', () => {
    expect(so('MuiChip').clickable[COARSE]).toMatchObject(hitArea44)
    expect(so('MuiChip').root).toMatchObject({ borderRadius: TOKENS.radius })
    expect(so('MuiChip').root).not.toHaveProperty('minHeight')
  })

  it('tree items and hover table rows reach 44px', () => {
    expect(so('MuiTreeItem').content[COARSE].minHeight).toBe(44)
    expect(so('MuiTableRow').hover[COARSE].height).toBe(44)
  })

  it('hitArea44 is a centred 44px pseudo-element', () => {
    expect(hitArea44['&::after']).toMatchObject({ width: 44, height: 44, position: 'absolute', top: '50%', left: '50%' })
  })
})

describe('tooltips on touch', () => {
  it('open after a short press and stay readable for 4 s; the look is unchanged', () => {
    expect(comp.MuiTooltip.defaultProps).toMatchObject({ enterTouchDelay: 300, leaveTouchDelay: 4000 })
    expect(comp.MuiTooltip.styleOverrides.tooltip).toMatchObject({ fontSize: 11, backgroundColor: TOKENS.bgRaised })
  })
})
