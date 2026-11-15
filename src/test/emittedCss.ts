/** Test helper: the CSS the document head holds after a render (emotion and style-mod), whitespace-normalised. */
export function emittedCss(): string {
  const parts: string[] = []
  for (const el of Array.from(document.head.querySelectorAll('style'))) {
    let text = el.textContent ?? ''
    if (!text.trim() && el.sheet) text = Array.from(el.sheet.cssRules).map((r) => r.cssText).join('\n')
    parts.push(text)
  }
  return parts.join('\n').replace(/\s+/g, ' ')
}

/** Only the rules whose selector names a class of `el`: what styles that one element, not the whole page. */
export function emittedCssFor(el: Element): string {
  const css = emittedCss()
  const rules: string[] = []
  for (const cls of Array.from(el.classList).filter((c) => c.startsWith('css-'))) {
    const re = new RegExp(`[^{}]*\\.${cls}[^{}]*\\{[^}]*\\}`, 'g')
    rules.push(...(css.match(re) ?? []))
  }
  return rules.join('\n')
}

/** The declarations emitted for `el` inside `@media <media>{...}` (stylis form: no spaces after colons), joined; '' when none. */
export function emittedInMedia(el: Element, media: string): string {
  const css = emittedCss().replace(/\s*([:;{},])\s*/g, '$1')
  const gate = `@media ${media.replace(/^@media\s+/, '').replace(/\s*([:;{},])\s*/g, '$1')}{`
  const out: string[] = []
  for (const cls of Array.from(el.classList).filter((c) => c.startsWith('css-'))) {
    const re = new RegExp(`${gate.replace(/[()]/g, '\\$&')}[^@]*?\\.${cls}[^{}]*\\{([^}]*)\\}`, 'g')
    for (const m of css.matchAll(re)) out.push(m[1])
  }
  return out.join(';')
}
