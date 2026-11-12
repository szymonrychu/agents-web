/** Agent aliases are a free comma-separated list; the server normalises and validates. */
export function parseAliases(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter((s) => s !== '')
}

export function formatAliases(aliases: string[]): string {
  return aliases.join(', ')
}
