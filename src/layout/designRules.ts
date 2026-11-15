/** Design-rules guard: the declutter rules as one machine check, so slop cannot creep back file by file. */
import selfSource from './designRules.ts?raw'

/** This file's own raw text: the glob below cannot see the module that runs it. */
export const SELF_PATH = 'layout/designRules.ts'

/** Raw text of every non-test source file below src, keyed by its path relative to src (e.g. "App.tsx"), this file included. */
export const SOURCES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })).map(
      ([path, text]) => [path.replace(/^\.\.\//, '').replace(/^\.\//, 'layout/'), text as string],
    ),
  ),
  [SELF_PATH]: selfSource,
}

/** Files allowed to hold colour literals: the theme tokens. */
const COLOUR_FILES = ['theme.ts']
/** Short yes/no confirmations: they stay a centred dialog on phones, every other Dialog is fullWidth or fullScreen. */
export const CONFIRM_DIALOG_FILES = ['layout/ConfirmDialog.tsx', 'vault/DeleteDialog.tsx']
/** Files allowed to call useMediaQuery: layout decisions go through useLayout; the others pick a diff or dialog variant. */
export const MEDIA_QUERY_FILES = ['layout/useLayout.ts', 'proposals/ValueDiff.tsx', 'proposals/ProposalReviewDialog.tsx', 'attention/DecisionsPreviewDialog.tsx']
const INPUT_TAG = /(?<![\w.])<(TextField|InputBase|OutlinedInput|FilledInput|Input|Select|NativeSelect|Autocomplete|input|textarea|select)(?=[\s/>])/g
const FONT_SIZE = /fontSize|font-size|font:/
const DIALOG_TAG = /(?<![\w.])<Dialog(?=[\s>])/g
const HOVER_REVEAL = /:hover[^'"\n{}]*['"]?\s*:\s*\{[^}]*\b(opacity|visibility)\b/g
const ALLOWED_WEIGHTS = ['400', '500']
const OFF_GRID_SPACING = /(?<![\d.])(1\.25|0\.75|1\.5|2\.5)(?!\d)/
const SPACING_KEY = /(?<![\w.])(m|p|mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py|gap|rowGap|columnGap|spacing|margin\w*|padding\w*)\s*[:=]\s*(\{[^}]*\}|[^,}\n]+)/g
const WEIGHT_KEY = /fontWeight\s*[:=]\s*\{?\s*['"]?(\w+)/g
const COLOUR_LITERAL = /(?<![\w&])#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b0x[0-9a-fA-F]+/
const EFFECT = /\b(boxShadow|backdropFilter|textShadow)\b|gradient/i
const SECONDARY_COLOUR = /\bcolor\s*=\s*\{?\s*['"]secondary['"]/
/** Smart quotes, dashes, ellipsis, bullets, arrows, box drawing, geometric shapes, symbols, dingbats, emoji. */
const DECORATIVE = /[\u2013\u2014\u2018-\u201D\u2022\u2026\u2190-\u21FF\u2500-\u27BF\u2B00-\u2BFF]|\p{Extended_Pictographic}/u

/** Index just past the `>` closing the JSX opening tag that starts at `start`, skipping braces and quoted strings. */
function tagEnd(source: string, start: number): number {
  let depth = 0
  let quote = ''
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0 && source[i - 1] !== '=') return i + 1
  }
  return source.length
}

/**
 * Check one source file against the declutter rules.
 * @param path - path relative to src; this rules file is exempt (its patterns spell out the banned words, its glyphs are escaped); theme.ts may hold colour literals.
 * @param source - raw file text.
 * @returns one message per violation, "<rule>: <path> line <n>: <what>"; empty when clean.
 */
export function designViolations(path: string, source: string): string[] {
  const out: string[] = []
  if (path === SELF_PATH) return out
  const lineAt = (index: number): number => source.slice(0, index).split('\n').length
  const add = (rule: string, line: number, what: string): void => {
    out.push(`${rule}: ${path} line ${line}: ${what}`)
  }

  source.split('\n').forEach((text, i) => {
    const line = i + 1
    if (!COLOUR_FILES.includes(path) && COLOUR_LITERAL.test(text)) add('colour', line, 'colour literal outside theme.ts, use a theme token')
    if (EFFECT.test(text)) add('effect', line, 'no boxShadow, backdropFilter, textShadow or gradient, panels are flat and opaque')
    if (SECONDARY_COLOUR.test(text)) add('secondary', line, 'no color="secondary"')
    if (DECORATIVE.test(text)) add('unicode', line, 'decorative unicode (dash, ellipsis, arrow, bullet glyph, emoji), use plain text')
    for (const m of text.matchAll(WEIGHT_KEY)) {
      if (/^\d+$/.test(m[1]) ? !ALLOWED_WEIGHTS.includes(m[1]) : /^(bold|bolder|lighter|normal|semibold)$/i.test(m[1])) add('weight', line, `fontWeight ${m[1]}, only 400 and 500 are allowed`)
    }
    for (const m of text.matchAll(SPACING_KEY)) {
      const off = m[2].match(OFF_GRID_SPACING)
      if (off) add('spacing', line, `${m[1]}: ${off[1]} is off the spacing grid`)
    }
  })

  for (const m of source.matchAll(/<(Alert|Button|IconButton)\b/g)) {
    const tag = source.slice(m.index, tagEnd(source, m.index))
    if (m[1] === 'Alert' && /\bvariant\s*=\s*\{?\s*['"]filled['"]/.test(tag)) add('alert', lineAt(m.index), 'Alert variant="filled" is banned')
    if (m[1] !== 'Alert' && /\btitle\s*=/.test(tag)) add('title', lineAt(m.index), `title= on <${m[1]}>, use aria-label`)
  }
  for (const m of source.matchAll(INPUT_TAG)) {
    if (FONT_SIZE.test(source.slice(m.index, tagEnd(source, m.index)))) add('input-font', lineAt(m.index), `fontSize on <${m[1]}>, the theme owns input size (16 px floor)`)
  }
  if (!CONFIRM_DIALOG_FILES.includes(path)) {
    for (const m of source.matchAll(DIALOG_TAG)) {
      if (!/\bfull(Width|Screen)\b/.test(source.slice(m.index, tagEnd(source, m.index)))) add('dialog', lineAt(m.index), '<Dialog> needs fullWidth or fullScreen (full screen on phones)')
    }
  }
  if (!MEDIA_QUERY_FILES.includes(path)) {
    const at = source.search(/\buseMediaQuery\b/)
    if (at >= 0) add('media-query', lineAt(at), 'useMediaQuery outside useLayout, use useLayout() or useTouchOrSmall()')
  }
  for (const m of source.matchAll(HOVER_REVEAL)) add('hover-reveal', lineAt(m.index), `${m[1]} set under :hover, everything must be visible without hover`)
  return out
}
