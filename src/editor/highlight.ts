/**
 * The file editor's look: the dark editor chrome and the syntax highlight style, built only from the theme tokens
 * (`TOKENS`, `MONO_FONT`, `syntaxPalette`). `defaultHighlightStyle` is not used: it is made for light themes.
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { MONO_FONT, TOKENS, syntaxPalette as p } from '../theme'

export const editorHighlight: HighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.self], color: p.keyword },
  { tag: [t.string, t.special(t.string), t.regexp, t.labelName], color: p.string },
  { tag: t.number, color: p.number },
  { tag: t.comment, color: p.comment, fontStyle: 'italic' },
  { tag: [t.meta, t.documentMeta, t.processingInstruction], color: p.comment },
  { tag: [t.propertyName, t.attributeName], color: p.property },
  { tag: [t.typeName, t.className, t.namespace], color: p.type },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: p.function },
  { tag: [t.operator, t.escape], color: p.operator },
  { tag: t.punctuation, color: p.punctuation },
  { tag: [t.atom, t.bool, t.null, t.unit], color: p.atom },
  { tag: t.invalid, color: p.invalid },
])

const BORDER = `${TOKENS.borderWidth}px solid ${TOKENS.border}`
const SELECTION = { background: TOKENS.borderStrong }
/** Wavy underline of a lint range, replacing the base theme's SVG image (its colours are not theme colours). */
const underline = (colour: string) => ({ backgroundImage: 'none', textDecoration: `underline wavy ${colour}`, textDecorationSkipInk: 'none' })
/** Round gutter marker of a lint severity, replacing the base theme's SVG content. */
const marker = (colour: string) => ({ content: 'none', backgroundColor: colour, borderRadius: '50%' })

/** The `EditorView.theme` spec, exported so its colours can be checked against the theme. */
export const editorChromeSpec = {
  '&': { backgroundColor: TOKENS.bgCanvas, color: TOKENS.textPrimary, fontSize: `${TOKENS.fontSizes.md / 16}rem`, height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO_FONT, lineHeight: 1.5 },
  '.cm-content': { caretColor: TOKENS.accent },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: TOKENS.accent },
  '.cm-selectionBackground': SELECTION,
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': SELECTION,
  '.cm-content ::selection': SELECTION,
  // translucent, so the selection layer below the lines stays visible on the active line
  '.cm-activeLine': { backgroundColor: `color-mix(in srgb, ${TOKENS.bgRaised} 70%, transparent)` },
  '.cm-gutters': { backgroundColor: TOKENS.bgCanvas, color: TOKENS.textDisabled, borderRight: BORDER },
  '.cm-activeLineGutter': { backgroundColor: TOKENS.bgRaised, color: TOKENS.textSecondary },
  '.cm-specialChar': { color: p.invalid },
  '.cm-lintRange-error': underline(p.invalid),
  '.cm-lintRange-warning': underline(TOKENS.warning),
  '.cm-lintRange-info, .cm-lintRange-hint': underline(TOKENS.textSecondary),
  '.cm-lintRange-active': { backgroundColor: TOKENS.bgRaised },
  '.cm-lint-marker-error': marker(p.invalid),
  '.cm-lint-marker-warning': marker(TOKENS.warning),
  '.cm-lint-marker-info': marker(TOKENS.textSecondary),
  '.cm-diagnostic-error': { borderLeft: `${TOKENS.borderWidth * 3}px solid ${p.invalid}` },
  '.cm-diagnostic-warning': { borderLeft: `${TOKENS.borderWidth * 3}px solid ${TOKENS.warning}` },
  '.cm-diagnostic-info, .cm-diagnostic-hint': { borderLeft: `${TOKENS.borderWidth * 3}px solid ${TOKENS.textSecondary}` },
  '.cm-diagnosticAction': { backgroundColor: TOKENS.bgRaised, color: TOKENS.textPrimary },
  '.cm-tooltip': { backgroundColor: TOKENS.bgRaised, color: TOKENS.textPrimary, border: BORDER },
  '.cm-panels': { backgroundColor: TOKENS.bgPanel, color: TOKENS.textPrimary },
  '.cm-panels.cm-panels-bottom': { borderTop: BORDER },
}

export const editorChrome: Extension = EditorView.theme(editorChromeSpec, { dark: true })

/** The chrome plus the highlight style, the editor's whole look in one extension. */
export const editorAppearance: Extension = [editorChrome, syntaxHighlighting(editorHighlight)]
