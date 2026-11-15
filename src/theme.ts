/**
 * The single Material Design (MUI) theme of the dashboard: neutral dark, flat, colour only for state.
 *
 * Fonts come from the system stacks (no web-font download: the UI must work offline and under CSP).
 */
import type {} from '@mui/x-tree-view/themeAugmentation'
import { createTheme } from '@mui/material/styles'
import { safeInset } from './layout/safeArea'

export const TOKENS = {
  // surfaces
  bgCanvas: '#0f1013',
  bgPanel: '#16181d',
  bgRaised: '#1d2026',
  border: '#2a2e36',
  borderStrong: '#3a3f49',
  // text
  textPrimary: '#d6d9de',
  textSecondary: '#8d939c',
  textDisabled: '#5a6069',
  // the one accent: neutral light grey, no hue
  accent: '#e8eaed',
  accentText: '#0f1013',
  // state only
  error: '#e5484d',
  warning: '#e2a336',
  // working (blue) and waiting for input (purple): the terminal palette's blue and magenta
  info: '#5b9bd5',
  attention: '#b083d6',
  // shape and density
  radius: 2,
  borderWidth: 1,
  panelHeaderPx: 32,
  controlPx: 32,
  touchTargetPx: 44,
  // type
  fontSizes: { xs: 11, sm: 12, md: 13, lg: 14, xl: 16 },
  fontWeights: { regular: 400, medium: 500 },
} as const

export const MONO_FONT = '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
export const SANS_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
/** Minimum size of an interactive target on coarse pointers, per Material/WCAG touch guidance. */
export const TOUCH_TARGET_PX = TOKENS.touchTargetPx
/** Size of a dense control on fine pointers. */
export const CONTROL_PX = TOKENS.controlPx
/** Background behind canvases, 3D views and plots. */
export const CANVAS_BG = TOKENS.bgCanvas
/** Opaque background of panels, including those drawn over the map or 3D view. */
export const PANEL_BG = TOKENS.bgPanel

/** Colours of the xterm.js screen: the dashboard surfaces plus the 16 ANSI colours a shell and its tools print with. */
export const terminalTheme = {
  background: TOKENS.bgCanvas,
  foreground: TOKENS.textPrimary,
  cursor: TOKENS.accent,
  cursorAccent: TOKENS.bgCanvas,
  selectionBackground: TOKENS.borderStrong,
  black: '#1d2026',
  red: '#e5484d',
  green: '#4cb782',
  yellow: '#e2a336',
  blue: '#5b9bd5',
  magenta: '#b083d6',
  cyan: '#4fb8c4',
  white: '#d6d9de',
  brightBlack: '#5a6069',
  brightRed: '#f2777b',
  brightGreen: '#6fd0a0',
  brightYellow: '#f0c060',
  brightBlue: '#7fb3e6',
  brightMagenta: '#c9a3e6',
  brightCyan: '#7ccdd6',
  brightWhite: '#e8eaed',
} as const

/** Colours of highlighted code in the file editor: the terminal's hues, one per token class. */
export const syntaxPalette = {
  keyword: terminalTheme.magenta,
  string: terminalTheme.green,
  number: terminalTheme.yellow,
  comment: TOKENS.textSecondary,
  property: terminalTheme.blue,
  type: terminalTheme.cyan,
  function: terminalTheme.brightBlue,
  operator: terminalTheme.brightCyan,
  punctuation: terminalTheme.white,
  atom: terminalTheme.brightMagenta,
  invalid: terminalTheme.red,
} as const

export type DiffMode = 'light' | 'dark'

/** Colours of a diff (lines, changed words, gutter markers, collapsed runs) per palette mode, GitHub-like. */
export const diffPalette: Record<
  DiffMode,
  {
    canvas: string
    text: string
    gutterText: string
    border: string
    removedLine: string
    addedLine: string
    removedWord: string
    addedWord: string
    removedMarker: string
    addedMarker: string
    collapsedBg: string
    collapsedText: string
  }
> = {
  dark: {
    canvas: TOKENS.bgCanvas,
    text: TOKENS.textPrimary,
    gutterText: TOKENS.textDisabled,
    border: TOKENS.border,
    removedLine: 'rgba(229, 72, 77, 0.15)',
    addedLine: 'rgba(76, 183, 130, 0.15)',
    removedWord: 'rgba(229, 72, 77, 0.40)',
    addedWord: 'rgba(76, 183, 130, 0.40)',
    removedMarker: terminalTheme.red,
    addedMarker: terminalTheme.green,
    collapsedBg: TOKENS.bgRaised,
    collapsedText: TOKENS.textSecondary,
  },
  light: {
    canvas: '#ffffff',
    text: '#1f2328',
    gutterText: '#6e7781',
    border: '#d0d7de',
    removedLine: '#ffebe9',
    addedLine: '#dafbe1',
    removedWord: '#ffcecb',
    addedWord: '#aceebb',
    removedMarker: '#cf222e',
    addedMarker: '#1a7f37',
    collapsedBg: '#ddf4ff',
    collapsedText: '#57606a',
  },
}

const { regular, medium } = TOKENS.fontWeights
const { xs, sm, md, lg, xl } = TOKENS.fontSizes
export const COARSE = '@media (pointer: coarse)'
/** Phones: width below the `sm` breakpoint (600); createTheme cannot read its own breakpoints, so a test pins this literal to theme.breakpoints.down('sm'). */
export const PHONE = '@media (max-width:599.95px)'
/** iOS Safari zooms the page on focus of any text surface under 16 px; this is the floor on touch and small viewports. */
export const NO_ZOOM_INPUT_PX = 16
/** Touch devices (also an iPad in landscape) and any window under 900 px; a mouse at >= 900 px keeps the dense 13 px UI. */
export const TOUCH_OR_SMALL_QUERY = '(pointer: coarse), (hover: none), (max-width: 899.95px)'
export const TOUCH_OR_SMALL = `@media ${TOUCH_OR_SMALL_QUERY}` as const
/** Every focusable text surface, incl. CodeMirror and the xterm helper textarea whose own styles would undercut the floor. */
export const NO_ZOOM_SELECTOR =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), textarea, select, [contenteditable]:not([contenteditable=false]), .cm-editor, .cm-content, .xterm .xterm-helper-textarea'
const sized = (px: number, fontWeight: number) => ({ fontSize: `${px / 16}rem`, fontWeight, letterSpacing: 0 })
const BORDER = `${TOKENS.borderWidth}px solid ${TOKENS.border}`
const touchSized = {
  minHeight: CONTROL_PX,
  minWidth: CONTROL_PX,
  [COARSE]: { minHeight: TOUCH_TARGET_PX, minWidth: TOUCH_TARGET_PX },
}

/** An invisible 44px hit box centred on a small visible control (checkbox thumb, chip); the layout box does not change. */
export const hitArea44 = {
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: TOUCH_TARGET_PX,
    height: TOUCH_TARGET_PX,
    transform: 'translate(-50%, -50%)',
  },
} as const

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: TOKENS.accent, contrastText: TOKENS.accentText },
    secondary: { main: TOKENS.textSecondary },
    info: { main: TOKENS.textSecondary },
    success: { main: TOKENS.textPrimary },
    error: { main: TOKENS.error },
    warning: { main: TOKENS.warning },
    background: { default: TOKENS.bgCanvas, paper: TOKENS.bgPanel },
    divider: TOKENS.border,
    text: { primary: TOKENS.textPrimary, secondary: TOKENS.textSecondary, disabled: TOKENS.textDisabled },
  },
  shape: { borderRadius: TOKENS.radius },
  typography: {
    fontFamily: SANS_FONT,
    fontSize: md,
    fontWeightLight: regular,
    fontWeightRegular: regular,
    fontWeightMedium: medium,
    fontWeightBold: medium,
    h1: sized(xl, medium),
    h2: sized(xl, medium),
    h3: sized(xl, medium),
    h4: sized(xl, medium),
    h5: sized(lg, medium),
    h6: sized(lg, medium),
    subtitle1: sized(lg, regular),
    subtitle2: sized(md, medium),
    body1: sized(md, regular),
    body2: sized(sm, regular),
    caption: sized(xs, regular),
    overline: { ...sized(sm, medium), textTransform: 'none' },
    button: { ...sized(md, medium), textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' },
        body: { fontVariantNumeric: 'tabular-nums', backgroundColor: TOKENS.bgCanvas },
        // safety net: per-field sx, CodeMirror theme classes and xterm inline styles cannot undercut the floor
        [TOUCH_OR_SMALL]: { [NO_ZOOM_SELECTOR]: { fontSize: `${NO_ZOOM_INPUT_PX}px !important` } },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { [TOUCH_OR_SMALL]: { fontSize: '1rem' } },
        input: { [TOUCH_OR_SMALL]: { fontSize: '1rem' } },
      },
    },
    MuiDialog: {
      styleOverrides: {
        // a short confirmation (no fullWidth) stays centred with a gutter
        paper: { [PHONE]: { margin: '16px' } },
        // every form dialog sets fullWidth: on a phone it is a full-screen sheet clear of the notch and Home Indicator
        paperFullWidth: {
          [PHONE]: {
            margin: 0,
            width: '100%',
            maxWidth: '100%',
            height: '100%',
            maxHeight: '100%',
            borderRadius: 0,
            paddingTop: safeInset('top'),
            paddingBottom: safeInset('bottom'),
            paddingLeft: safeInset('left'),
            paddingRight: safeInset('right'),
          },
        },
        // fullScreen without fullWidth must not inherit the gutter of the paper rule above
        paperFullScreen: { [PHONE]: { margin: 0, maxWidth: '100%' } },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { ...touchSized, textTransform: 'none', fontWeight: medium } },
    },
    MuiIconButton: {
      styleOverrides: { root: touchSized },
    },
    MuiChip: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: { borderRadius: TOKENS.radius, fontSize: xs },
        clickable: { [COARSE]: hitArea44 },
      },
    },
    MuiToggleButton: {
      styleOverrides: { root: { [COARSE]: { minHeight: TOUCH_TARGET_PX } } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { [COARSE]: { minHeight: TOUCH_TARGET_PX } } },
    },
    MuiCheckbox: {
      styleOverrides: { root: { [COARSE]: { minWidth: TOUCH_TARGET_PX, minHeight: TOUCH_TARGET_PX } } },
    },
    MuiRadio: {
      styleOverrides: { root: { [COARSE]: { minWidth: TOUCH_TARGET_PX, minHeight: TOUCH_TARGET_PX } } },
    },
    MuiSwitch: {
      styleOverrides: { switchBase: { [COARSE]: hitArea44 } },
    },
    MuiTreeItem: {
      styleOverrides: { content: { [COARSE]: { minHeight: TOUCH_TARGET_PX } } },
    },
    MuiTableRow: {
      styleOverrides: { hover: { [COARSE]: { height: TOUCH_TARGET_PX } } },
    },
    MuiAlert: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderRadius: TOKENS.radius, borderLeftWidth: 3 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: xs, backgroundColor: TOKENS.bgRaised, color: TOKENS.textPrimary, border: BORDER },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: TOKENS.accent } },
    },
    MuiTab: {
      styleOverrides: { root: { minHeight: 40, textTransform: 'none', fontWeight: medium, [COARSE]: { minHeight: 48 } } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { height: 2, borderRadius: 0 } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: { root: { borderBottom: BORDER } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none', border: BORDER } },
    },
  },
})
