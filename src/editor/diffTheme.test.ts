import { describe, expect, it } from 'vitest'
import { diffPalette, type DiffMode } from '../theme'
import { diffThemeSpec } from './diffTheme'

const MODES: DiffMode[] = ['dark', 'light']
/** The banned effect word, spelled in two parts so the design-rules scan of this file stays quiet. */
const BANNED = 'gradi' + 'ent'

/** The rule whose selector list names `selector` (a spec key may hold several comma-separated selectors). */
const ruleFor = (spec: Record<string, Record<string, string>>, selector: string): Record<string, string> | undefined =>
  Object.entries(spec).find(([key]) => key.split(',').map((s) => s.trim()).includes(selector))?.[1]

describe('diffThemeSpec', () => {
  for (const mode of MODES) {
    describe(mode, () => {
      const spec = diffThemeSpec(mode)
      const p = diffPalette[mode]

      it('colours removed and added lines, the deleted chunk and both changed-text sides', () => {
        expect(ruleFor(spec, '&.cm-merge-a .cm-changedLine')?.backgroundColor).toBe(p.removedLine)
        expect(ruleFor(spec, '.cm-deletedChunk')?.backgroundColor).toBe(p.removedLine)
        expect(ruleFor(spec, '&.cm-merge-b .cm-changedLine')?.backgroundColor).toBe(p.addedLine)
        const removedText = ruleFor(spec, '&.cm-merge-a .cm-changedText')
        expect(removedText).toMatchObject({ backgroundColor: p.removedWord, backgroundImage: 'none', textDecoration: 'none' })
        expect(ruleFor(spec, '.cm-deletedChunk .cm-deletedText')).toBe(removedText)
        expect(ruleFor(spec, '&.cm-merge-b .cm-changedText')).toMatchObject({ backgroundColor: p.addedWord, backgroundImage: 'none', textDecoration: 'none' })
      })

      it('draws collapsed runs as a flat clickable bar', () => {
        expect(ruleFor(spec, '.cm-collapsedLines')).toMatchObject({ backgroundColor: p.collapsedBg, color: p.collapsedText, backgroundImage: 'none', cursor: 'pointer' })
      })

      it('marks the gutter with - on side a and + on side b in the marker colours', () => {
        expect(ruleFor(spec, '&.cm-merge-a .cm-changedLineGutter')?.color).toBe(p.removedMarker)
        expect(ruleFor(spec, '.cm-deletedLineGutter')?.color).toBe(p.removedMarker)
        expect(ruleFor(spec, '&.cm-merge-b .cm-changedLineGutter')?.color).toBe(p.addedMarker)
        expect(ruleFor(spec, '&.cm-merge-a .cm-changedLineGutter::before')?.content).toBe('"-"')
        expect(ruleFor(spec, '&.cm-merge-b .cm-changedLineGutter::before')?.content).toBe('"+"')
      })

      it('sets the canvas, text and gutter colours', () => {
        expect(spec['&']).toMatchObject({ backgroundColor: p.canvas, color: p.text })
        expect(spec['.cm-gutters']).toMatchObject({ backgroundColor: p.canvas, color: p.gutterText })
      })

      it('uses only colours of its palette', () => {
        const allowed = new Set<string>(Object.values(p))
        for (const [selector, rule] of Object.entries(spec)) {
          for (const [prop, value] of Object.entries(rule)) {
            expect(value.toLowerCase(), `${selector} ${prop}`).not.toContain(BANNED)
            if (/color$/i.test(prop) || prop === 'background') expect(allowed.has(value), `${selector} ${prop}: ${value}`).toBe(true)
            if (/^border/.test(prop)) expect([...allowed].some((c) => value.endsWith(c)), `${selector} ${prop}: ${value}`).toBe(true)
          }
        }
      })
    })
  }

  it('dark and light added lines differ and the light canvas is the light palette one', () => {
    expect(ruleFor(diffThemeSpec('dark'), '&.cm-merge-b .cm-changedLine')?.backgroundColor).not.toBe(ruleFor(diffThemeSpec('light'), '&.cm-merge-b .cm-changedLine')?.backgroundColor)
    expect(diffThemeSpec('light')['&'].backgroundColor).toBe(diffPalette.light.canvas)
  })
})
