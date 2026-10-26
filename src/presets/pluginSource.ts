/**
 * Plugin source check mirroring any-mcp's source grammar (design D1) for the forms the orchestrator
 * accepts (design D8): `git::https://<host>/<path>[//<subdir>][?ref=<ref>]` and
 * `github.com/<owner>/<repo>[//<subdir>][?ref=<ref>]`. Pure string work; the caller stores the trimmed text.
 */

const ACCEPTED_FORMS = 'git::https://<host>/<path>[//<subdir>][?ref=<ref>] or github.com/<owner>/<repo>[//<subdir>][?ref=<ref>]'

const UNRECOGNISED = `unrecognised form, accepted forms: ${ACCEPTED_FORMS}`

const HTTPS_GIT = 'git::https://'
const SHORTHAND = 'github.com/'

/** `<host>/<path>` of a git::https URL: a host without '/', then a non-empty path. */
const HOST_AND_PATH = /^[^/]+\/.+$/
/** `<owner>/<repo>` of the shorthand. */
const OWNER_AND_REPO = /^[^/]+\/[^/]+$/
const REF_CHARS = /^[A-Za-z0-9._/-]+$/

const LOCAL_PREFIXES = ['./', '../', '/']
const NON_HTTPS_GIT = ['git::ssh://', 'git::file://']
const SCP_LIKE = /^[^/:]+@[^/:]+:/
// eslint-disable-next-line no-control-regex -- C0 and DEL are exactly what these refuse
const CONTROL = /[\x00-\x1f\x7f]/
// eslint-disable-next-line no-control-regex -- C0 and DEL are exactly what these refuse
const BLANK_OR_CONTROL = /[\s\x00-\x1f\x7f]/
const REMOTE_PREFIXES = ['git::', SHORTHAND]

function refProblem(query: string): string | undefined {
  if (query === '') return 'empty query, only ?ref=<ref> is allowed'
  const refs: string[] = []
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=')
    const key = eq === -1 ? pair : pair.slice(0, eq)
    if (key !== 'ref') return `unsupported query key '${key}', only ref is allowed`
    refs.push(eq === -1 ? '' : pair.slice(eq + 1))
  }
  if (refs.length > 1) return 'ref is given more than once'
  const ref = refs[0]
  if (ref === '') return 'ref is empty'
  if (ref.startsWith('-')) return "ref must not start with '-'"
  if (!REF_CHARS.test(ref)) return "ref may hold only letters, digits, '.', '_', '/' and '-'"
  if (ref.includes('..')) return "ref must not contain '..'"
  return undefined
}

function subdirProblem(subdir: string): string | undefined {
  if (subdir.startsWith('/')) return "subdir must be relative (no leading '/')"
  const segments = subdir.split('/')
  if (segments.includes('')) return 'subdir has an empty segment'
  if (segments.includes('..')) return "subdir must not have a '..' segment"
  return undefined
}

/** The problem of a remote source whose prefix is already stripped: `<location>[//<subdir>][?<query>]`. */
function remoteProblem(rest: string, location: RegExp): string | undefined {
  const q = rest.indexOf('?')
  const beforeQuery = q === -1 ? rest : rest.slice(0, q)
  const s = beforeQuery.indexOf('//')
  if (!location.test(s === -1 ? beforeQuery : beforeQuery.slice(0, s))) return UNRECOGNISED
  return (s === -1 ? undefined : subdirProblem(beforeQuery.slice(s + 2))) ?? (q === -1 ? undefined : refProblem(rest.slice(q + 1)))
}

function problem(text: string): string | undefined {
  if (REMOTE_PREFIXES.some((p) => text.startsWith(p)) && BLANK_OR_CONTROL.test(text)) return 'a remote source may not contain whitespace or control characters'
  if (CONTROL.test(text)) return 'a source may not contain control characters'
  if (LOCAL_PREFIXES.some((p) => text.startsWith(p)) || NON_HTTPS_GIT.some((p) => text.startsWith(p)) || SCP_LIKE.test(text)) {
    return `only https git sources are allowed (${ACCEPTED_FORMS})`
  }
  if (text.startsWith(HTTPS_GIT)) return remoteProblem(text.slice(HTTPS_GIT.length), HOST_AND_PATH)
  if (text.startsWith(SHORTHAND)) return remoteProblem(text.slice(SHORTHAND.length), OWNER_AND_REPO)
  return UNRECOGNISED
}

/** The reason the plugin source is refused, or undefined when it is valid; surrounding whitespace is ignored. */
export function pluginSourceError(text: string): string | undefined {
  const source = text.trim()
  if (source === '') return 'plugin source is empty'
  const p = problem(source)
  return p === undefined ? undefined : `plugin source '${source}': ${p}`
}
