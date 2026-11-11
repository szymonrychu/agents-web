/** Slug for a heading: lowercase, runs of non [a-z0-9] become '-', trimmed; duplicates get -2, -3 via `seen`. */
export function headingId(text: string, seen: Map<string, number>): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
  const n = (seen.get(base) ?? 0) + 1
  seen.set(base, n)
  return n === 1 ? base : `${base}-${n}`
}
