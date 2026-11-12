/**
 * The diff look (GitHub "Files changed" style) over `@codemirror/merge`: removed and added line tints, changed-word
 * highlights, `-` / `+` gutter markers and a flat collapsed-run bar, every colour from `diffPalette` in the theme.
 * Selectors match the package's `baseTheme` rules with equal specificity; theme rules mount after base theme rules,
 * so these win. Imported only by the lazy diff module, never the main chunk.
 */
import { syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { MONO_FONT, TOKENS, diffPalette, type DiffMode } from '../theme'
import { editorAppearance, editorHighlight } from './highlight'

/** The `EditorView.theme` spec of a diff in `mode`, exported so its colours can be checked against the palette. */
export function diffThemeSpec(mode: DiffMode): Record<string, Record<string, string>> {
  const p = diffPalette[mode]
  const word = (colour: string) => ({ backgroundColor: colour, backgroundImage: 'none', textDecoration: 'none' })
  return {
    '&': { backgroundColor: p.canvas, color: p.text },
    '.cm-scroller': { fontFamily: MONO_FONT, lineHeight: '1.5' },
    '.cm-gutters': { backgroundColor: p.canvas, color: p.gutterText, borderRight: `${TOKENS.borderWidth}px solid ${p.border}` },
    '&.cm-merge-a .cm-changedLine, .cm-deletedChunk': { backgroundColor: p.removedLine },
    '&.cm-merge-b .cm-changedLine': { backgroundColor: p.addedLine },
    '&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText': word(p.removedWord),
    '&.cm-merge-b .cm-changedText': word(p.addedWord),
    '.cm-changeGutter': { width: '1.5ch', paddingLeft: '0', textAlign: 'center' },
    '&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter': { backgroundColor: p.removedLine, color: p.removedMarker },
    '&.cm-merge-b .cm-changedLineGutter': { backgroundColor: p.addedLine, color: p.addedMarker },
    '&.cm-merge-a .cm-changedLineGutter::before, .cm-deletedLineGutter::before': { content: '"-"' },
    '&.cm-merge-b .cm-changedLineGutter::before': { content: '"+"' },
    '.cm-collapsedLines': { backgroundColor: p.collapsedBg, backgroundImage: 'none', color: p.collapsedText, cursor: 'pointer' },
  }
}

/** The whole look of a diff editor in `mode`: dark adds the editor chrome, light only the highlight style. */
export function diffAppearance(mode: DiffMode): Extension {
  return mode === 'dark'
    ? [editorAppearance, EditorView.theme(diffThemeSpec('dark'), { dark: true })]
    : [syntaxHighlighting(editorHighlight), EditorView.theme(diffThemeSpec('light'), { dark: false })]
}
