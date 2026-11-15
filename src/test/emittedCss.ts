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
