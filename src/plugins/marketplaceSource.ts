/**
 * A plugin marketplace source is one string in the spec (what `claude plugin marketplace add` takes). The editor
 * shows it as a kind plus fields: github `owner/repo[#ref]`, git `<url>[#ref]`, url `https://.../marketplace.json`,
 * directory `<path>`. Pure string work.
 */
export type SourceKind = 'github' | 'git' | 'url' | 'directory'

export interface SourceParts {
  kind: SourceKind
  value: string
  ref: string
}

export const SOURCE_KINDS: readonly SourceKind[] = ['github', 'git', 'url', 'directory']

const GITHUB = /^[\w.-]+\/[\w.-]+$/
const PATH = /^(\.{1,2}\/|\/|~)\S*$/
const HTTP = /^https?:\/\/[^/\s]+/
const GIT_URL = /^(https?:\/\/[^/\s]+\/\S+|ssh:\/\/\S+|git:\/\/\S+|git@[^:\s]+:\S+)$/

export function formatSource({ kind, value, ref }: SourceParts): string {
  const v = value.trim()
  if (v === '') return ''
  const r = ref.trim()
  return (kind === 'github' || kind === 'git') && r !== '' ? `${v}#${r}` : v
}

export function parseSource(source: string): SourceParts {
  const s = source.trim()
  if (s === '') return { kind: 'github', value: '', ref: '' }
  const hash = s.indexOf('#')
  const base = hash === -1 ? s : s.slice(0, hash)
  const ref = hash === -1 ? '' : s.slice(hash + 1)
  if (/^(\.{0,2}\/|~)/.test(s)) return { kind: 'directory', value: s, ref: '' }
  if (HTTP.test(base) && base.endsWith('.json')) return { kind: 'url', value: s, ref: '' }
  if (GIT_URL.test(base)) return { kind: 'git', value: base, ref }
  return { kind: 'github', value: base, ref }
}

/** The problem with a source, or null when it is acceptable. */
export function sourceError({ kind, value }: SourceParts): string | null {
  const v = value.trim()
  if (v === '') return 'source is required'
  if (kind === 'github' && !GITHUB.test(v)) return 'github source must be owner/repo'
  if (kind === 'git' && !GIT_URL.test(v)) return 'must be a git URL (https, ssh or git@host:path)'
  if (kind === 'url' && !HTTP.test(v)) return 'must be an http(s) URL of a marketplace.json'
  if (kind === 'directory' && !PATH.test(v)) return 'must be a path starting with ./, ../, / or ~'
  return null
}
