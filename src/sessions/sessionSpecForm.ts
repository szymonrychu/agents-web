/** Form state, inline validation and sparse spec mapping for the preset editor. Server stays the authority. */
import type { SessionSpec, Meta } from '../api/client'
import type { components } from '../api/schema'

type EnvVarIn = components['schemas']['EnvVarIn']
import type { Hooks } from '../hooks/types'
import { validateHooks } from '../hooks/validate'
import { pluginSourceError } from '../presets/pluginSource'

/**
 * One env variable, GitLab CI style. A protected variable is write-only: `stored` marks one that came from the server
 * (it holds no value here, only `isSet`/`updatedAt`), `replacing` means the user is typing a new value, and a protected
 * row that is neither stored nor replacing is a plain row just marked protected, whose `value` is sent once.
 */
export interface EnvRow {
  key: string
  value: string
  protected: boolean
  expand: boolean
  /** Protected row read from the server: its value is never shown. */
  stored: boolean
  isSet: boolean
  updatedAt: string | null
  /** A stored protected row whose value is being replaced; `value` holds the new one. */
  replacing: boolean
  /** The stored entry was an old plain string, which the server no longer accepts. */
  legacy: boolean
}

export const envRow = (key = '', value = ''): EnvRow => ({ key, value, protected: false, expand: false, stored: false, isSet: false, updatedAt: null, replacing: false, legacy: false })

/** Whether the row sends a value on save (a plain row always; a protected one only when new or replacing). */
export const sendsValue = (r: EnvRow): boolean => !r.protected || !r.stored || r.replacing

function envRowFromStored(key: string, entry: unknown): EnvRow {
  if (typeof entry === 'string') return { ...envRow(key, entry), legacy: true }
  const e = (entry ?? {}) as { value?: unknown; protected?: unknown; expand?: unknown; set?: unknown; updated_at?: unknown }
  if (e.protected === true) return { ...envRow(key), protected: true, stored: true, isSet: e.set === true, updatedAt: typeof e.updated_at === 'string' ? e.updated_at : null }
  return { ...envRow(key, typeof e.value === 'string' ? e.value : ''), expand: e.expand === true }
}

export interface FormValues {
  name: string
  replicas: string
  /** Empty means same as replicas. */
  maxReplicas: string
  static: boolean
  model: string
  effort: string
  peers: boolean
  workdir: string
  pvcSize: string
  env: EnvRow[]
  anyMcp: string
  /** any-mcp plugin sources, one per row, in order. */
  anyMcpSources: string[]
  initScripts: string[]
  /** Jinja template sent before the session, webhook, chat or cron prompt, in one message. */
  startPrompt: string
  maxAttempts: string
  autoCompact: string
  cpuRequest: string
  cpuLimit: string
  memRequest: string
  memLimit: string
  hookUrl: string
  leaderLease: string
  autocloseAfter: string
  /** Usage quota ceilings in percent (1 to 100); empty uses the orchestrator default. */
  quotaFiveHour: string
  quotaSevenDay: string
  /** Trigger events for the same item go to the agent still running for it. */
  reuseRunningAgent: boolean
  /** Superleader: the session's leader can message the leaders of all sessions; the spec carries it only when on. */
  sessionMessaging: boolean
  /** Agents get read-write access to every namespace and resource; the spec carries it only when on. */
  kubeAccess: boolean
  compactIdle: string
  compactInstructions: string
  compactMinTokens: string
  systemAppend: string
  restartPrompt: string
  turnStall: string
  maxRestarts: string
  turnMax: string
  agentCommands: string[]
  /** Comma list. */
  permAllow: string
  permDeny: string
  /** Claude permission mode (`bypassPermissions` or `auto`); empty means unset, which the wrapper treats as Allow all. */
  permissionMode: string
  /** JSON text, empty means unset. */
  hooks: string
  mcpServers: string
  plugins: string
  /** Not editable in the form; carried so an edit does not drop a stored image. */
  image: string
  /** Workspace cache in S3; the spec carries `cache` only when this is on. */
  cacheEnabled: boolean
  /** On: the server derives both keys from the preset and the form sends neither. */
  cacheDerive: boolean
  /** Jinja template (surface `archive_name`); empty is a fresh start. Used when `cacheDerive` is off. */
  cacheRestoreKey: string
  /** Jinja template (surface `archive_name`); empty is restore-only. Used when `cacheDerive` is off. */
  cacheSaveKey: string
  /** One glob per line, relative to the workdir. */
  cacheExclude: string
}

export type FormErrors = Partial<Record<Exclude<keyof FormValues, 'env' | 'initScripts' | 'agentCommands' | 'anyMcpSources'>, string>> & { env?: (string | undefined)[]; initScripts?: (string | undefined)[]; anyMcpSources?: (string | undefined)[] }

type WrapperField = 'compactIdle' | 'compactInstructions' | 'compactMinTokens' | 'systemAppend' | 'restartPrompt' | 'turnStall' | 'maxRestarts' | 'turnMax' | 'agentCommands' | 'permAllow' | 'permDeny' | 'permissionMode' | 'hooks' | 'mcpServers' | 'plugins'
const JSON_FIELDS = ['hooks', 'mcpServers', 'plugins'] as const

/** What the user set: a spec key, with the four resource fields counting as one `resources` key. */
export type SetKey = 'replicas' | 'maxReplicas' | 'static' | 'model' | 'effort' | 'peers' | 'workdir' | 'pvcSize' | 'env' | 'anyMcp' | 'anyMcpSources' | 'initScripts' | 'startPrompt' | 'maxAttempts' | 'autoCompact' | 'resources' | 'hookUrl' | 'image' | WrapperField | 'leaderLease' | 'autocloseAfter' | 'quotaFiveHour' | 'quotaSevenDay' | 'reuseRunningAgent' | 'sessionMessaging' | 'kubeAccess' | 'cache'

/** Form values together with the fields that are set (the ones a save writes to the preset). */
export interface FormState {
  values: FormValues
  setKeys: Set<SetKey>
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const NAME_CHARS = /^[A-Za-z0-9 ._-]+$/
const RESERVED_KEY = /^(CCW_|CLAUDE_|ANTHROPIC_)|^POD_NAME$|_PROXY$|BASE_URL$/i
export const MAX_SLUG = 40
export const MAX_NAME = 40
export const MAX_INIT_SCRIPTS = 20
export const MAX_INIT_SCRIPT_CHARS = 16384
const COPY_SUFFIX = ' copy'
/** Cache keys starting with this are derived by the server from a preset id. */
export const CACHE_KEY_RESERVED_PREFIX = 'preset-'
export const MAX_CACHE_KEY = 256
export const MAX_CACHE_EXCLUDE = 50
export const MAX_CACHE_EXCLUDE_CHARS = 256

export function blankValues(meta: Meta | null): FormValues {
  const d = meta?.defaults
  return {
    name: '', replicas: d ? String(d.replicas) : '', maxReplicas: '', static: false, model: d?.model ?? '', effort: d?.effort ?? '', peers: true, workdir: d?.workdir ?? 'workdir',
    pvcSize: d?.pvc_size ?? '', env: [], anyMcp: d && Object.keys(d.any_mcp_config).length > 0 ? JSON.stringify(d.any_mcp_config, null, 2) : '', anyMcpSources: [], initScripts: [], startPrompt: '',
    maxAttempts: d ? String(d.max_attempts) : '', autoCompact: d ? String(d.auto_compact_pct) : '',
    cpuRequest: d?.resources.requests.cpu ?? '', cpuLimit: d?.resources.limits.cpu ?? '',
    memRequest: d?.resources.requests.memory ?? '', memLimit: d?.resources.limits.memory ?? '', hookUrl: '', image: '',
    leaderLease: '', autocloseAfter: '', quotaFiveHour: '', quotaSevenDay: '', reuseRunningAgent: false, sessionMessaging: false, kubeAccess: false, compactIdle: '', compactInstructions: '', compactMinTokens: '', systemAppend: '', restartPrompt: '', turnStall: '', maxRestarts: '', turnMax: '',
    agentCommands: [], permAllow: '', permDeny: '', permissionMode: '', hooks: '', mcpServers: '', plugins: '',
    cacheEnabled: false, cacheDerive: true, cacheRestoreKey: '', cacheSaveKey: '', cacheExclude: '',
  }
}

/** The set-key that owns a form field. */
export function setKeyOf(field: keyof FormValues): SetKey | null {
  if (field === 'name') return null
  if (field === 'cacheEnabled' || field === 'cacheDerive' || field === 'cacheRestoreKey' || field === 'cacheSaveKey' || field === 'cacheExclude') return 'cache'
  return field === 'cpuRequest' || field === 'cpuLimit' || field === 'memRequest' || field === 'memLimit' ? 'resources' : field
}

/**
 * Form state for a stored preset spec: the stored value for every stored key, the /meta default
 * (`blankValues(meta)`) for every other field; only the stored keys are set. A stored null counts as not stored.
 */
export function stateFromPreset(meta: Meta | null, name: string, spec: Partial<SessionSpec>): FormState {
  const values = { ...blankValues(meta), name }
  const setKeys = new Set<SetKey>()
  const text = (key: SetKey, field: 'model' | 'effort' | 'workdir' | 'pvcSize' | 'hookUrl' | 'image' | 'startPrompt', stored: string | null | undefined) => {
    if (stored === null || stored === undefined) return
    values[field] = stored
    setKeys.add(key)
  }
  const num = (key: SetKey, field: 'replicas' | 'maxReplicas' | 'maxAttempts' | 'autoCompact' | 'leaderLease' | 'autocloseAfter' | 'quotaFiveHour' | 'quotaSevenDay', stored: number | null | undefined) => {
    if (stored === null || stored === undefined) return
    values[field] = String(stored)
    setKeys.add(key)
  }
  num('replicas', 'replicas', spec.replicas)
  num('maxReplicas', 'maxReplicas', spec.max_replicas)
  if (spec.static !== undefined && spec.static !== null) {
    values.static = spec.static
    setKeys.add('static')
  }
  text('model', 'model', spec.model)
  text('effort', 'effort', spec.effort)
  if (spec.peers !== undefined && spec.peers !== null) {
    values.peers = spec.peers
    setKeys.add('peers')
  }
  text('workdir', 'workdir', spec.workdir)
  text('pvcSize', 'pvcSize', spec.pvc_size)
  if (spec.env) {
    values.env = Object.entries(spec.env).map(([key, entry]) => envRowFromStored(key, entry))
    setKeys.add('env')
  }
  if (spec.any_mcp_config) {
    values.anyMcp = JSON.stringify(spec.any_mcp_config, null, 2)
    setKeys.add('anyMcp')
  }
  if (spec.any_mcp_sources) {
    values.anyMcpSources = [...spec.any_mcp_sources]
    setKeys.add('anyMcpSources')
  }
  if (spec.init_scripts) {
    values.initScripts = [...spec.init_scripts]
    setKeys.add('initScripts')
  }
  num('maxAttempts', 'maxAttempts', spec.max_attempts)
  num('autoCompact', 'autoCompact', spec.auto_compact_pct)
  if (spec.resources) {
    values.cpuRequest = spec.resources.requests.cpu ?? ''
    values.memRequest = spec.resources.requests.memory ?? ''
    values.cpuLimit = spec.resources.limits.cpu ?? ''
    values.memLimit = spec.resources.limits.memory ?? ''
    setKeys.add('resources')
  }
  text('hookUrl', 'hookUrl', spec.discard_hook_url)
  text('image', 'image', spec.image)
  text('startPrompt', 'startPrompt', spec.start_prompt)
  num('leaderLease', 'leaderLease', spec.leader_lease_seconds)
  num('autocloseAfter', 'autocloseAfter', spec.autoclose_after_seconds)
  num('quotaFiveHour', 'quotaFiveHour', spec.usage_quota?.five_hour_pct)
  num('quotaSevenDay', 'quotaSevenDay', spec.usage_quota?.seven_day_pct)
  if (spec.reuse_running_agent !== null && spec.reuse_running_agent !== undefined) {
    values.reuseRunningAgent = spec.reuse_running_agent
    setKeys.add('reuseRunningAgent')
  }
  if (spec.session_messaging) {
    values.sessionMessaging = true
    setKeys.add('sessionMessaging')
  }
  if (spec.kube_access) {
    values.kubeAccess = true
    setKeys.add('kubeAccess')
  }
  if (spec.cache) {
    values.cacheEnabled = true
    const { restore_key: restore, save_key: save } = spec.cache
    values.cacheDerive = (restore ?? null) === null && (save ?? null) === null
    values.cacheRestoreKey = restore ?? ''
    values.cacheSaveKey = save ?? ''
    values.cacheExclude = (spec.cache.exclude ?? []).join('\n')
    setKeys.add('cache')
  }
  const w = spec.wrapper
  if (w) {
    const wtext = (field: WrapperField & keyof FormValues, stored: string | number | null | undefined) => {
      if (stored === null || stored === undefined) return
      ;(values as Record<string, unknown>)[field] = String(stored)
      setKeys.add(field)
    }
    wtext('compactIdle', w.auto_compact?.idle_seconds)
    wtext('compactInstructions', w.auto_compact?.instructions)
    wtext('compactMinTokens', w.auto_compact?.min_context_tokens)
    wtext('systemAppend', w.system_append)
    wtext('restartPrompt', w.restart_continue_prompt)
    wtext('turnStall', w.turn_stall_seconds)
    wtext('maxRestarts', w.max_restarts)
    wtext('turnMax', w.turn_max_seconds)
    wtext('permissionMode', w.permission_mode)
    if (w.agent_commands) {
      values.agentCommands = [...w.agent_commands]
      setKeys.add('agentCommands')
    }
    if (w.permissions?.allow) {
      values.permAllow = w.permissions.allow.join(', ')
      setKeys.add('permAllow')
    }
    if (w.permissions?.deny) {
      values.permDeny = w.permissions.deny.join(', ')
      setKeys.add('permDeny')
    }
    const wjson = (field: (typeof JSON_FIELDS)[number], stored: unknown) => {
      if (stored === null || stored === undefined) return
      values[field] = JSON.stringify(stored, null, 2)
      setKeys.add(field)
    }
    wjson('hooks', w.hooks)
    wjson('mcpServers', w.mcp_servers)
    wjson('plugins', w.plugins)
  }
  return { values, setKeys }
}

/** Name for a copy: the source cut so the whole name fits MAX_NAME, right-trimmed, then " copy". */
export function copyName(source: string): string {
  return source.slice(0, MAX_NAME - COPY_SUFFIX.length).trimEnd() + COPY_SUFFIX
}

const intIn = (text: string, min: number, max: number, what: string): string | undefined => {
  if (!/^\d+$/.test(text.trim())) return `${what} must be a whole number`
  const n = Number(text)
  return n < min || n > max ? `${what} must be ${min} to ${max}` : undefined
}

/** Error for the value of a row that must send one (a protected variable cannot be saved empty). */
export function envValueError(r: EnvRow): string | undefined {
  return r.protected && sendsValue(r) && r.value === '' ? 'A protected variable needs a value' : undefined
}

export function envKeyError(key: string, all: EnvRow[]): string | undefined {
  if (key === '') return 'Key is required'
  if (!ENV_NAME.test(key)) return 'Key may hold letters, digits and underscores only'
  if (RESERVED_KEY.test(key)) return 'Reserved name, set by the orchestrator'
  if (all.filter((r) => r.key === key).length > 1) return 'Duplicate key'
  return undefined
}

export function hookUrlError(text: string): string | undefined {
  if (text.trim() === '') return undefined
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? undefined : 'Must be an http or https URL'
  } catch {
    return 'Must be an http or https URL'
  }
}

export function jsonObjectError(text: string): string | undefined {
  if (text.trim() === '') return undefined
  try {
    const v: unknown = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? undefined : 'Must be a JSON object'
  } catch {
    return 'Must be valid JSON'
  }
}

export const anyMcpError = jsonObjectError

/** Per-script errors mirroring the server (at most 20, each non-empty after trim and at most 16384 characters); undefined when all are fine. */
export function initScriptErrors(scripts: string[]): (string | undefined)[] | undefined {
  const errors = scripts.map((s, i): string | undefined => {
    if (i >= MAX_INIT_SCRIPTS) return `Init script ${i + 1}: at most ${MAX_INIT_SCRIPTS} init scripts`
    if (s.trim() === '') return `Init script ${i + 1} must not be empty`
    if (s.length > MAX_INIT_SCRIPT_CHARS) return `Init script ${i + 1} must be at most ${MAX_INIT_SCRIPT_CHARS} characters`
    return undefined
  })
  return errors.some(Boolean) ? errors : undefined
}

/** A key template; the server renders and validates it (the preview shows the result), only the length is checked here. */
export const cacheKeyError = (label: string, key: string): string | undefined =>
  key.length > MAX_CACHE_KEY ? `${label}: at most ${MAX_CACHE_KEY} characters` : undefined

/** The exclude globs of the text: one per line, trimmed, blank lines dropped. */
export const cacheExcludeLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean)

/** Exclude rules of the server: at most 50 globs, each at most 256 characters, relative, no `..` segment. */
export function cacheExcludeError(text: string): string | undefined {
  const lines = cacheExcludeLines(text)
  if (lines.length > MAX_CACHE_EXCLUDE) return `Exclude: at most ${MAX_CACHE_EXCLUDE} globs`
  for (const [i, line] of lines.entries()) {
    if (line.length > MAX_CACHE_EXCLUDE_CHARS) return `Exclude line ${i + 1}: at most ${MAX_CACHE_EXCLUDE_CHARS} characters`
    if (line.startsWith('/') || line.split('/').includes('..')) return `Exclude line ${i + 1}: must be relative with no '..' segment`
  }
  return undefined
}

export function nameError(name: string): string | undefined {
  if (name === '') return 'Name is required'
  if (name.length > MAX_NAME) return `Name must be at most ${MAX_NAME} characters`
  if (name !== name.trim()) return 'Name must not start or end with a space'
  if (!NAME_CHARS.test(name)) return 'Name may hold letters, digits, spaces, dots, dashes and underscores'
  return undefined
}

/**
 * Inline errors; an empty field is never an error because clearing a field means unset.
 */
export function validate(v: FormValues, meta: Meta | null): FormErrors {
  const e: FormErrors = {}
  e.name = nameError(v.name)
  e.replicas = v.replicas.trim() === '' ? undefined : intIn(v.replicas, 1, meta?.caps.max_replicas ?? 16, 'Replicas')
  const replicas = /^\d+$/.test(v.replicas.trim()) ? Number(v.replicas) : meta?.defaults.replicas ?? 1
  e.maxReplicas = v.maxReplicas.trim() === '' ? undefined : intIn(v.maxReplicas, Math.max(1, replicas), meta?.caps.max_replicas ?? 16, 'Max replicas')
  if (e.maxReplicas === undefined && v.static && v.maxReplicas.trim() !== '' && Number(v.maxReplicas) !== replicas) e.static = 'Static needs max replicas equal to replicas'
  e.maxAttempts = v.maxAttempts.trim() === '' ? undefined : intIn(v.maxAttempts, 1, 100, 'Max attempts')
  e.autoCompact = v.autoCompact.trim() === '' ? undefined : intIn(v.autoCompact, 1, 100, 'Auto-compact percent')
  e.anyMcp = anyMcpError(v.anyMcp)
  e.hookUrl = hookUrlError(v.hookUrl)
  e.leaderLease = v.leaderLease.trim() === '' ? undefined : intIn(v.leaderLease, 60, 604800, 'Leader lease seconds')
  e.autocloseAfter = v.autocloseAfter.trim() === '' ? undefined : intIn(v.autocloseAfter, 1, 2592000, 'Autoclose after seconds')
  e.quotaFiveHour = v.quotaFiveHour.trim() === '' ? undefined : intIn(v.quotaFiveHour, 1, 100, '5-hour quota percent')
  e.quotaSevenDay = v.quotaSevenDay.trim() === '' ? undefined : intIn(v.quotaSevenDay, 1, 100, 'Weekly quota percent')
  e.compactMinTokens = v.compactMinTokens.trim() === '' ? undefined : intIn(v.compactMinTokens, 0, Number.MAX_SAFE_INTEGER, 'Min context tokens')
  e.maxRestarts = v.maxRestarts.trim() === '' ? undefined : intIn(v.maxRestarts, 0, 10, 'Max restarts')
  e.compactIdle = nonNegative(v.compactIdle, 'Auto-compact idle seconds')
  e.turnStall = nonNegative(v.turnStall, 'Turn stall seconds')
  e.turnMax = nonNegative(v.turnMax, 'Turn max seconds')
  e.systemAppend = v.systemAppend.length > 16384 ? 'System append must be at most 16384 characters' : undefined
  for (const f of JSON_FIELDS) e[f] = jsonObjectError(v[f])
  if (meta && !e.hooks && v.hooks.trim() !== '') {
    const problems = validateHooks(JSON.parse(v.hooks) as Hooks, meta.hook_events)
    if (problems.length > 0) e.hooks = problems.map((p) => `${p.path}: ${p.message}`).join('; ')
  }
  const envErrors = v.env.map((r) => envKeyError(r.key, v.env) ?? envValueError(r))
  if (envErrors.some(Boolean)) e.env = envErrors
  const scriptErrors = initScriptErrors(v.initScripts)
  if (scriptErrors) e.initScripts = scriptErrors
  const sourceErrors = v.anyMcpSources.map(pluginSourceError)
  if (sourceErrors.some(Boolean)) e.anyMcpSources = sourceErrors
  if (v.cacheEnabled) {
    if (!v.cacheDerive) {
      e.cacheRestoreKey = cacheKeyError('Restore key', v.cacheRestoreKey)
      e.cacheSaveKey = cacheKeyError('Save key', v.cacheSaveKey)
    }
    e.cacheExclude = cacheExcludeError(v.cacheExclude)
  }
  for (const k of Object.keys(e) as (keyof FormErrors)[]) if (e[k] === undefined) delete e[k]
  return e
}

const nonNegative = (text: string, what: string): string | undefined =>
  text.trim() === '' ? undefined : /^\d+(\.\d+)?$/.test(text.trim()) ? undefined : `${what} must be a number of 0 or more`

const csv = (text: string): string[] => text.split(',').map((s) => s.trim()).filter(Boolean)

function pairs(cpu: string, memory: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (cpu.trim()) out.cpu = cpu.trim()
  if (memory.trim()) out.memory = memory.trim()
  return out
}

/**
 * Maps validated form values to a sparse preset spec: only the set fields, as SessionSpec keys.
 * A set field that is empty is omitted (clearing means unset), so no key is ever null.
 */
export function toPresetSpec(v: FormValues, setKeys: ReadonlySet<SetKey>): Partial<SessionSpec> {
  const spec: Record<string, unknown> = {}
  const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim())
  const int = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))
  if (setKeys.has('replicas')) spec.replicas = int(v.replicas)
  if (setKeys.has('maxReplicas')) spec.max_replicas = int(v.maxReplicas)
  if (setKeys.has('static')) spec.static = v.static
  if (setKeys.has('model')) spec.model = str(v.model)
  if (setKeys.has('effort')) spec.effort = str(v.effort)
  if (setKeys.has('peers')) spec.peers = v.peers
  if (setKeys.has('workdir')) spec.workdir = str(v.workdir)
  if (setKeys.has('pvcSize')) spec.pvc_size = str(v.pvcSize)
  if (setKeys.has('env') && v.env.length > 0) spec.env = Object.fromEntries(v.env.map((r) => [r.key, envEntry(r)]))
  if (setKeys.has('anyMcp') && v.anyMcp.trim() !== '') spec.any_mcp_config = JSON.parse(v.anyMcp) as Record<string, unknown>
  if (setKeys.has('anyMcpSources') && v.anyMcpSources.length > 0) spec.any_mcp_sources = v.anyMcpSources.map((s) => s.trim())
  if (setKeys.has('initScripts')) spec.init_scripts = [...v.initScripts]
  if (setKeys.has('maxAttempts')) spec.max_attempts = int(v.maxAttempts)
  if (setKeys.has('autoCompact')) spec.auto_compact_pct = int(v.autoCompact)
  if (setKeys.has('resources')) {
    const requests = pairs(v.cpuRequest, v.memRequest)
    const limits = pairs(v.cpuLimit, v.memLimit)
    if (Object.keys(requests).length + Object.keys(limits).length > 0) spec.resources = { requests, limits }
  }
  if (setKeys.has('hookUrl')) spec.discard_hook_url = str(v.hookUrl)
  if (setKeys.has('image')) spec.image = str(v.image)
  if (setKeys.has('startPrompt')) spec.start_prompt = str(v.startPrompt)
  if (setKeys.has('leaderLease')) spec.leader_lease_seconds = int(v.leaderLease)
  if (setKeys.has('autocloseAfter')) spec.autoclose_after_seconds = int(v.autocloseAfter)
  const quota = {
    ...(setKeys.has('quotaFiveHour') && int(v.quotaFiveHour) !== undefined && { five_hour_pct: int(v.quotaFiveHour) }),
    ...(setKeys.has('quotaSevenDay') && int(v.quotaSevenDay) !== undefined && { seven_day_pct: int(v.quotaSevenDay) }),
  }
  if (Object.keys(quota).length > 0) spec.usage_quota = quota
  if (setKeys.has('reuseRunningAgent')) spec.reuse_running_agent = v.reuseRunningAgent
  if (setKeys.has('sessionMessaging') && v.sessionMessaging) spec.session_messaging = true
  if (setKeys.has('kubeAccess') && v.kubeAccess) spec.kube_access = true
  if (setKeys.has('cache') && v.cacheEnabled) {
    const exclude = cacheExcludeLines(v.cacheExclude)
    spec.cache = { ...(!v.cacheDerive && { restore_key: v.cacheRestoreKey, save_key: v.cacheSaveKey }), ...(exclude.length > 0 && { exclude }) }
  }
  const wrapper = wrapperFromValues(v, setKeys)
  if (Object.keys(wrapper).length > 0) spec.wrapper = wrapper
  return Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)) as Partial<SessionSpec>
}

/** The request form of a row: protected never carries expand, and carries a value only when it sends one. */
function envEntry(r: EnvRow): EnvVarIn {
  if (!r.protected) return { value: r.value, protected: false, expand: r.expand }
  return sendsValue(r) ? { protected: true, expand: false, value: r.value } : { protected: true, expand: false }
}

/** The sparse wrapper settings object: only set, non-empty fields. */
function wrapperFromValues(v: FormValues, setKeys: ReadonlySet<SetKey>): Record<string, unknown> {
  const w: Record<string, unknown> = {}
  const has = (k: WrapperField) => setKeys.has(k)
  const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim())
  const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))
  const group = (entries: [string, unknown][]) => Object.fromEntries(entries.filter(([, x]) => x !== undefined))
  const compact = group([
    ['idle_seconds', has('compactIdle') ? num(v.compactIdle) : undefined],
    ['instructions', has('compactInstructions') ? str(v.compactInstructions) : undefined],
    ['min_context_tokens', has('compactMinTokens') ? num(v.compactMinTokens) : undefined],
  ])
  const allow = has('permAllow') ? csv(v.permAllow) : []
  const deny = has('permDeny') ? csv(v.permDeny) : []
  const json = (k: (typeof JSON_FIELDS)[number]) => (has(k) && v[k].trim() !== '' ? (JSON.parse(v[k]) as unknown) : undefined)
  Object.assign(w, group([
    ['auto_compact', Object.keys(compact).length > 0 ? compact : undefined],
    ['system_append', has('systemAppend') ? str(v.systemAppend) : undefined],
    ['restart_continue_prompt', has('restartPrompt') ? str(v.restartPrompt) : undefined],
    ['turn_stall_seconds', has('turnStall') ? num(v.turnStall) : undefined],
    ['max_restarts', has('maxRestarts') ? num(v.maxRestarts) : undefined],
    ['turn_max_seconds', has('turnMax') ? num(v.turnMax) : undefined],
    ['permission_mode', has('permissionMode') ? str(v.permissionMode) : undefined],
    ['agent_commands', has('agentCommands') && v.agentCommands.length > 0 ? [...v.agentCommands] : undefined],
    ['permissions', allow.length + deny.length > 0 ? group([['allow', allow.length > 0 ? allow : undefined], ['deny', deny.length > 0 ? deny : undefined]]) : undefined],
    ['hooks', json('hooks')],
    ['mcp_servers', json('mcpServers')],
    ['plugins', json('plugins')],
  ]))
  return w
}
