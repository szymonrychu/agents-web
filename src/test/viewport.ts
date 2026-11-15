/** Test helper: a matchMedia that evaluates the width, height, pointer and hover features the layout uses. */
export interface ViewportOptions {
  /** A touch device: pointer coarse, hover none. Default is a mouse. */
  coarse?: boolean
  height?: number
}

const feature = (cond: string, width: number, height: number, coarse: boolean): boolean => {
  const m = /^\(\s*([\w-]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(cond.trim())
  if (!m) return cond.trim() === 'screen' || cond.trim() === 'all'
  const [, name, value = ''] = m
  const px = Number(value.replace('px', ''))
  switch (name) {
    case 'min-width': return width >= px
    case 'max-width': return width <= px
    case 'min-height': return height >= px
    case 'max-height': return height <= px
    case 'pointer': return value === (coarse ? 'coarse' : 'fine')
    case 'hover': return value === (coarse ? 'none' : 'hover')
    default: return false
  }
}

/** Installs window.matchMedia and the window size for `width` x `opts.height` (default 800). */
export function setViewport(width: number, opts: ViewportOptions = {}): void {
  const height = opts.height ?? 800
  const coarse = opts.coarse ?? false
  const matches = (query: string) =>
    query.replace(/^@media\s+/, '').split(',').some((list) => list.split(/\s+and\s+/).every((c) => feature(c, width, height, coarse)))
  window.innerWidth = width
  window.innerHeight = height
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
