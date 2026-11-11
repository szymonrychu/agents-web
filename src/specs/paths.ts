export const specPath = (key: string): string => `/specs/${key}`

/** Document paths contain slashes, so each segment is encoded on its own; the `doc/` segment keeps them unambiguous. */
export const docPath = (key: string, path: string, query: { v?: number; diff?: number } = {}): string => {
  const q = new URLSearchParams()
  if (query.v !== undefined) q.set('v', String(query.v))
  if (query.diff !== undefined) q.set('diff', String(query.diff))
  const s = q.toString()
  return `/specs/${key}/doc/${path.split('/').map(encodeURIComponent).join('/')}${s ? `?${s}` : ''}`
}
