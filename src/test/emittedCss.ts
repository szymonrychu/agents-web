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

/**
 * Table guard: the table sits in a TableContainer, each `hidden` header cell emits display:none on xs and a table cell from sm
 * (hideOnPhone), and each `shown` header cell does not. `table` is the <table> element.
 */
export function phoneColumnProblems(table: Element, hidden: string[], shown: string[]): string[] {
  const problems: string[] = []
  if (!table.closest('.MuiTableContainer-root')) problems.push('table is not inside a TableContainer')
  const header = (label: string) => Array.from(table.querySelectorAll('thead th')).find((th) => th.textContent === label)
  // hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } }: none from 0 px, a table cell again from 600 px
  const phone = (el: Element) => emittedInMedia(el, '(min-width:0px)').includes('display:none') && emittedInMedia(el, '(min-width:600px)').includes('display:table-cell')
  for (const label of hidden) {
    const th = header(label)
    if (!th) problems.push(`no header ${label}`)
    else if (!phone(th)) problems.push(`header ${label} is not hidden on phones`)
  }
  for (const label of shown) {
    const th = header(label)
    if (!th) problems.push(`no header ${label}`)
    else if (phone(th)) problems.push(`header ${label} is hidden on phones`)
  }
  return problems
}
