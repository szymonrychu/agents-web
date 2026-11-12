/** Text forms of a proposal value for the diff. No CodeMirror import here: ItemCard (main chunk) uses it. */
import { stringify } from 'yaml'
import type { ProposalView } from './api'

export const isStructured = (v: unknown): boolean => typeof v === 'object' && v !== null

export const toYaml = (v: unknown): string => stringify(v, { sortMapEntries: true })

/**
 * The diff doc of a value. `text`: strings as raw multi-line text, anything else empty. Otherwise objects and arrays
 * are sorted YAML, an absent value (`null`, `undefined`) is empty like an added or deleted file, strings are
 * themselves and other scalars JSON.
 */
export const toDoc = (v: unknown, text?: boolean): string => {
  if (text) return typeof v === 'string' ? v : ''
  if (v === null || v === undefined) return ''
  if (isStructured(v)) return toYaml(v)
  return typeof v === 'string' ? v : JSON.stringify(v)
}

/** `init_scripts` as one doc: each entry under a `# init_scripts[i]` header line, then its raw lines. */
export const initScriptsDoc = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v) && v.every((s) => typeof s === 'string')) return v.map((s, i) => `# init_scripts[${i}]\n${s}`).join('\n')
  return toDoc(v)
}

export type DocMode = 'yaml' | 'text' | 'init_scripts'

/** How an item's values become diff docs: raw text for prompts, sections for init scripts, YAML otherwise. */
export function docMode(kind: ProposalView['kind'] | undefined, path: string): DocMode {
  if (kind === 'schedule') return path === 'prompt' ? 'text' : 'yaml'
  if (path === 'start_prompt') return 'text'
  if (path === 'init_scripts') return 'init_scripts'
  return 'yaml'
}
