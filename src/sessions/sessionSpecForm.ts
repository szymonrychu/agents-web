/** Form state, inline validation and sparse spec mapping for the preset editor. Server stays the authority. */
import type { SessionSpec, Meta } from '../api/client'
import { isVaultRef, type VaultRef } from '../vault/refs'
import type { Hooks } from '../hooks/types'
import { validateHooks } from '../hooks/validate'
import type { KubeNamespaceRow } from '../presets/KubeNamespaceAccessField'
import { backupRowErrors, entryFromRow, rowFromEntry } from '../backups/backupEntries'
import type { BackupRow } from '../backups/backupEntries'
import { pluginSourceError } from '../presets/pluginSource'
import { QUOTA_FIELD_LABELS } from '../usage/quotaLabels'

/** One env variable, GitLab CI style: a plain value (with `expand`) or a reference to a vault entry env. */
export interface EnvRow {
  key: string
  value: string
  expand: boolean
  /** Set for a vault reference row: `value` and `expand` then carry nothing. */
  vault: VaultRef | null
  /** The stored entry was an old plain string, which the server no longer accepts. */
  legacy: boolean
}

export const envRow = (key = '', value = ''): EnvRow => ({ key, value, expand: false, vault: null, legacy: false })

export const vaultRow = (key: string, ref: VaultRef): EnvRow => ({ ...envRow(key), vault: ref })

/** The wire form of an env row; local because the orchestrator types the output form as a free object. */
export type EnvEntry = { value: string; expand: boolean } | VaultRef

export const VAULT_REFS_MAX = 50

/**
 * Merges added rows into the current ones: an added key already present replaces that row in place (first match),
 * the others append; rows with an empty key, an empty value and no ref are dropped.
 */
export function mergeEnvRows(current: EnvRow[], added: EnvRow[]): EnvRow[] {
  const rows = [...current]
  for (const row of added) {
    const at = rows.findIndex((r) => r.key === row.key)
    if (at >= 0) rows[at] = row
    else rows.push(row)
  }
  return rows.filter((r) => r.key !== '' || r.value !== '' || r.vault !== null)
}

function envRowFromStored(key: string, entry: unknown): EnvRow {
  if (typeof entry === 'string') return { ...envRow(key, entry), legacy: true }
  if (isVaultRef(entry)) return vaultRow(key, { vault: entry.vault, env: entry.env })
  const e = (entry ?? {}) as { value?: unknown; expand?: unknown }
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
  /** Jinja template delivered as the session's first turn, before the session, webhook, chat or cron prompts. */
  startPrompt: string
  maxAttempts: string
  autoCompact: string
  cpuRequest: string
  cpuLimit: string
  memRequest: string
  memLimit: string
  hookUrl: string
  autocloseAfter: string
  /** Inactivity limits in seconds: empty uses the orchestrator setting, 0 turns the limit off. */
  inactivityReminder: string
  inactivityClose: string
  /** Usage quota ceilings in percent (1 to 100); empty uses the orchestrator default. */
  quotaFiveHour: string
  quotaSevenDay: string
  /** Trigger events for the same item go to the agent still running for it. */
  reuseRunningAgent: boolean
  /** Superleader: the session's leader can message the leaders of all sessions; the spec carries it only when on. */
  sessionMessaging: boolean
  /** Agents get cluster-admin in every namespace, Secrets included, through a ServiceAccount of this session; the spec carries it only when on. */
  kubeClusterAccess: boolean
  /** Namespace-scoped Kubernetes access: one row per namespace with its tiers; the spec carries it only when there are rows. */
  kubeNamespaceAccess: KubeNamespaceRow[]
  /** Privileged Docker-in-Docker sidecar; the spec carries it, and the three sizes, only when on. */
  docker: boolean
  dockerStorage: string
  dockerCpu: string
  dockerMemory: string
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
  /** JSON object text (wrapper.managed_settings), empty means unset. */
  managedSettings: string
  /** Agent image; empty means the orchestrator default. */
  image: string
  /** Runaway guard limits: whole numbers, empty uses the orchestrator setting, 0 turns the limit off. */
  runawayMaxTurnsPerTask: string
  runawayMaxTokensPerTask: string
  runawayMaxStopContinuations: string
  runawayMaxAgentSpawns: string
  runawayToolFailureRepeats: string
  runawayMaxConcurrentSubagents: string
  runawayMaxSubagentSpawnDepth: string
  /** Backup entries (spec.backup); each row is explicit, no entry is implied. */
  backup: BackupRow[]
  /** Retrospective agent (spec.retrospective): a human-only flag. */
  retrospective: boolean
  /** Handoff profile (`work` or `chat`); empty means unset. */
  handoffProfile: string
}

export type FormErrors = Partial<Record<Exclude<keyof FormValues, 'env' | 'initScripts' | 'agentCommands' | 'anyMcpSources' | 'kubeNamespaceAccess' | 'backup'>, string>> & { backup?: (string | undefined)[]; env?: (string | undefined)[]; envSection?: string; initScripts?: (string | undefined)[]; anyMcpSources?: (string | undefined)[]; kubeNamespaceAccess?: (string | undefined)[] }

type WrapperField = 'compactIdle' | 'compactInstructions' | 'compactMinTokens' | 'systemAppend' | 'restartPrompt' | 'turnStall' | 'maxRestarts' | 'turnMax' | 'agentCommands' | 'permAllow' | 'permDeny' | 'permissionMode' | 'hooks' | 'mcpServers' | 'plugins' | 'managedSettings'
const JSON_FIELDS = ['hooks', 'mcpServers', 'plugins', 'managedSettings'] as const

/** Runaway guard limits: form value, spec key and label. */
export const RUNAWAY_FIELDS = [
  { field: 'runawayMaxTurnsPerTask', key: 'max_turns_per_task', label: 'Max turns per task' },
  { field: 'runawayMaxTokensPerTask', key: 'max_tokens_per_task', label: 'Max tokens per task' },
  { field: 'runawayMaxStopContinuations', key: 'max_stop_continuations', label: 'Max stop continuations' },
  { field: 'runawayMaxAgentSpawns', key: 'max_agent_spawns', label: 'Max agent spawns' },
  { field: 'runawayToolFailureRepeats', key: 'tool_failure_repeats', label: 'Tool failure repeats' },
  { field: 'runawayMaxConcurrentSubagents', key: 'max_concurrent_subagents', label: 'Max concurrent subagents' },
  { field: 'runawayMaxSubagentSpawnDepth', key: 'max_subagent_spawn_depth', label: 'Max subagent spawn depth' },
] as const


/** What the user set: a spec key, with the four resource fields counting as one `resources` key. */
export type SetKey = 'replicas' | 'maxReplicas' | 'static' | 'model' | 'effort' | 'peers' | 'workdir' | 'pvcSize' | 'env' | 'anyMcp' | 'anyMcpSources' | 'initScripts' | 'startPrompt' | 'maxAttempts' | 'autoCompact' | 'resources' | 'hookUrl' | 'image' | WrapperField | 'autocloseAfter' | 'inactivityReminder' | 'inactivityClose' | 'quotaFiveHour' | 'quotaSevenDay' | (typeof RUNAWAY_FIELDS)[number]['field'] | 'reuseRunningAgent' | 'sessionMessaging' | 'kubeClusterAccess' | 'kubeNamespaceAccess' | 'docker' | 'backup' | 'retrospective' | 'handoffProfile'

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

export function blankValues(meta: Meta | null): FormValues {
  const d = meta?.defaults
  return {
    name: '', replicas: d ? String(d.replicas) : '', maxReplicas: '', static: false, model: d?.model ?? '', effort: d?.effort ?? '', peers: true, workdir: d?.workdir ?? 'workdir',
    pvcSize: d?.pvc_size ?? '', env: [], anyMcp: d && Object.keys(d.any_mcp_config).length > 0 ? JSON.stringify(d.any_mcp_config, null, 2) : '', anyMcpSources: [], initScripts: [], startPrompt: '',
    maxAttempts: d ? String(d.max_attempts) : '', autoCompact: d ? String(d.auto_compact_pct) : '',
    cpuRequest: d?.resources.requests.cpu ?? '', cpuLimit: d?.resources.limits.cpu ?? '',
    memRequest: d?.resources.requests.memory ?? '', memLimit: d?.resources.limits.memory ?? '', hookUrl: '', image: '',
    autocloseAfter: '', inactivityReminder: '', inactivityClose: '', quotaFiveHour: '', quotaSevenDay: '', reuseRunningAgent: false, sessionMessaging: false, kubeClusterAccess: false, kubeNamespaceAccess: [], docker: false, dockerStorage: '', dockerCpu: '', dockerMemory: '', compactIdle: '', compactInstructions: '', compactMinTokens: '', systemAppend: '', restartPrompt: '', turnStall: '', maxRestarts: '', turnMax: '',
    agentCommands: [], permAllow: '', permDeny: '', permissionMode: '', hooks: '', mcpServers: '', plugins: '', managedSettings: '', runawayMaxTurnsPerTask: '', runawayMaxTokensPerTask: '', runawayMaxStopContinuations: '', runawayMaxAgentSpawns: '', runawayToolFailureRepeats: '', runawayMaxConcurrentSubagents: '', runawayMaxSubagentSpawnDepth: '',
    backup: [], retrospective: false, handoffProfile: '',
  }
}

/** The set-key that owns a form field. */
export function setKeyOf(field: keyof FormValues): SetKey | null {
  if (field === 'name') return null
  if (field === 'dockerStorage' || field === 'dockerCpu' || field === 'dockerMemory') return 'docker'
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
  const num = (key: SetKey, field: 'replicas' | 'maxReplicas' | 'maxAttempts' | 'autoCompact' | 'autocloseAfter' | 'inactivityReminder' | 'inactivityClose' | 'quotaFiveHour' | 'quotaSevenDay' | (typeof RUNAWAY_FIELDS)[number]['field'], stored: number | null | undefined) => {
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
  num('autocloseAfter', 'autocloseAfter', spec.autoclose_after_seconds)
  num('inactivityReminder', 'inactivityReminder', spec.inactivity?.reminder_seconds)
  num('inactivityClose', 'inactivityClose', spec.inactivity?.close_seconds)
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
  if (spec.kube_cluster_access) {
    values.kubeClusterAccess = true
    setKeys.add('kubeClusterAccess')
  }
  if (spec.kube_namespace_access) {
    values.kubeNamespaceAccess = Object.entries(spec.kube_namespace_access).map(([namespace, tiers]) => ({ namespace, tiers: canonicalTiers(tiers) }))
    setKeys.add('kubeNamespaceAccess')
  }
  if (spec.docker) {
    values.docker = true
    values.dockerStorage = spec.docker_storage ?? ''
    values.dockerCpu = spec.docker_cpu ?? ''
    values.dockerMemory = spec.docker_memory ?? ''
    setKeys.add('docker')
  }
  if (spec.backup) {
    values.backup = spec.backup.map(rowFromEntry)
    setKeys.add('backup')
  }
  if (spec.retrospective) {
    values.retrospective = true
    setKeys.add('retrospective')
  }
  if (spec.handoff_profile) {
    values.handoffProfile = spec.handoff_profile
    setKeys.add('handoffProfile')
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
    wjson('managedSettings', w.managed_settings)
  }
  for (const { field, key } of RUNAWAY_FIELDS) num(field, field, spec.runaway?.[key])
  return { values, setKeys }
}

/** Name for a copy: the source cut so the whole name fits MAX_NAME, right-trimmed, then " copy". */
export function copyName(source: string): string {
  return source.slice(0, MAX_NAME - COPY_SUFFIX.length).trimEnd() + COPY_SUFFIX
}

/** Seconds as the orchestrator words them: `30 s`, `55 min` (floored), else hours floored to one decimal. */
export function humanizeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  const tenths = Math.floor(seconds / 360)
  const whole = Math.floor(tenths / 10)
  return tenths % 10 === 0 ? `${whole} h` : `${whole}.${tenths % 10} h`
}

const MAX_INACTIVITY = 2592000

/** 0 (off) or 60 to 2592000; empty is never an error. */
const inactivityError = (text: string, what: string): string | undefined => {
  if (text.trim() === '') return undefined
  const n = /^\d+$/.test(text.trim()) ? Number(text) : NaN
  return n === 0 || (n >= 60 && n <= MAX_INACTIVITY) ? undefined : `${what}: 0 or 60 to ${MAX_INACTIVITY}`
}

const intIn = (text: string, min: number, max: number, what: string): string | undefined => {
  if (!/^\d+$/.test(text.trim())) return `${what} must be a whole number`
  const n = Number(text)
  return n < min || n > max ? `${what} must be ${min} to ${max}` : undefined
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

const TIER_ORDER = ['read', 'port-forward', 'exec', 'edit', 'admin']

/** Tiers in the canonical order (read, port-forward, exec, edit, admin); a tier outside it sorts last. */
export function canonicalTiers(tiers: string[]): string[] {
  const rank = (t: string) => (TIER_ORDER.includes(t) ? TIER_ORDER.indexOf(t) : TIER_ORDER.length)
  return [...tiers].sort((a, b) => rank(a) - rank(b))
}

/** Per-row errors for the namespace access rows (a row needs a namespace and at least one tier); undefined when all are fine. */
export function kubeNamespaceAccessErrors(rows: KubeNamespaceRow[]): (string | undefined)[] | undefined {
  const errors = rows.map((r): string | undefined => (r.namespace === '' ? 'Pick a namespace' : r.tiers.length === 0 ? 'Pick at least one tier' : undefined))
  return errors.some(Boolean) ? errors : undefined
}

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
  e.autocloseAfter = v.autocloseAfter.trim() === '' ? undefined : intIn(v.autocloseAfter, 1, 2592000, 'Autoclose after seconds')
  e.inactivityReminder = inactivityError(v.inactivityReminder, 'Reminder after quiet seconds')
  e.inactivityClose = inactivityError(v.inactivityClose, 'Close after quiet seconds')
  if (!e.inactivityReminder && !e.inactivityClose) {
    const effective = (own: string, fallback: number | undefined) => (own.trim() === '' ? fallback ?? 0 : Number(own))
    const reminder = effective(v.inactivityReminder, meta?.inactivity.reminder_seconds)
    const close = effective(v.inactivityClose, meta?.inactivity.close_seconds)
    if (reminder > 0 && close > 0 && reminder >= close) {
      if (v.inactivityReminder.trim() !== '') e.inactivityReminder = 'Reminder after quiet seconds must be below close after quiet seconds'
      else if (v.inactivityClose.trim() !== '') e.inactivityClose = 'Close after quiet seconds must be above reminder after quiet seconds'
    }
  }
  e.quotaFiveHour = v.quotaFiveHour.trim() === '' ? undefined : intIn(v.quotaFiveHour, 1, 100, QUOTA_FIELD_LABELS.five_hour)
  e.quotaSevenDay = v.quotaSevenDay.trim() === '' ? undefined : intIn(v.quotaSevenDay, 1, 100, QUOTA_FIELD_LABELS.seven_day)
  for (const { field, label } of RUNAWAY_FIELDS) e[field] = v[field].trim() === '' ? undefined : intIn(v[field], 0, Number.MAX_SAFE_INTEGER, label)
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
  const envErrors = v.env.map((r) => envKeyError(r.key, v.env))
  if (envErrors.some(Boolean)) e.env = envErrors
  if (v.env.filter((r) => r.vault !== null).length > VAULT_REFS_MAX) e.envSection = `At most ${VAULT_REFS_MAX} vault references`
  const namespaceErrors = kubeNamespaceAccessErrors(v.kubeNamespaceAccess)
  if (namespaceErrors) e.kubeNamespaceAccess = namespaceErrors
  const scriptErrors = initScriptErrors(v.initScripts)
  if (scriptErrors) e.initScripts = scriptErrors
  const sourceErrors = v.anyMcpSources.map(pluginSourceError)
  if (sourceErrors.some(Boolean)) e.anyMcpSources = sourceErrors
  const backupErrors = backupRowErrors(v.backup)
  if (backupErrors) e.backup = backupErrors
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

/** Spec paths each set-key owns: a save rewrites exactly these and passes every other stored key through. */
const OWNED_PATHS: Record<SetKey, string[]> = {
  replicas: ['replicas'], maxReplicas: ['max_replicas'], static: ['static'], model: ['model'], effort: ['effort'], peers: ['peers'], workdir: ['workdir'], pvcSize: ['pvc_size'],
  env: ['env'], anyMcp: ['any_mcp_config'], anyMcpSources: ['any_mcp_sources'], initScripts: ['init_scripts'], startPrompt: ['start_prompt'], maxAttempts: ['max_attempts'],
  autoCompact: ['auto_compact_pct'], resources: ['resources.requests.cpu', 'resources.requests.memory', 'resources.limits.cpu', 'resources.limits.memory'],
  hookUrl: ['discard_hook_url'], image: ['image'], autocloseAfter: ['autoclose_after_seconds'], inactivityReminder: ['inactivity.reminder_seconds'], inactivityClose: ['inactivity.close_seconds'],
  quotaFiveHour: ['usage_quota.five_hour_pct'], quotaSevenDay: ['usage_quota.seven_day_pct'], reuseRunningAgent: ['reuse_running_agent'], sessionMessaging: ['session_messaging'],
  kubeClusterAccess: ['kube_cluster_access'], kubeNamespaceAccess: ['kube_namespace_access'], docker: ['docker', 'docker_storage', 'docker_cpu', 'docker_memory'], backup: ['backup'], retrospective: ['retrospective'], handoffProfile: ['handoff_profile'],
  compactIdle: ['wrapper.auto_compact.idle_seconds'], compactInstructions: ['wrapper.auto_compact.instructions'], compactMinTokens: ['wrapper.auto_compact.min_context_tokens'],
  systemAppend: ['wrapper.system_append'], restartPrompt: ['wrapper.restart_continue_prompt'], turnStall: ['wrapper.turn_stall_seconds'], maxRestarts: ['wrapper.max_restarts'],
  turnMax: ['wrapper.turn_max_seconds'], agentCommands: ['wrapper.agent_commands'], permAllow: ['wrapper.permissions.allow'], permDeny: ['wrapper.permissions.deny'],
  permissionMode: ['wrapper.permission_mode'], hooks: ['wrapper.hooks'], mcpServers: ['wrapper.mcp_servers'], plugins: ['wrapper.plugins'], managedSettings: ['wrapper.managed_settings'],
  ...(Object.fromEntries(RUNAWAY_FIELDS.map(({ field, key }) => [field, [`runaway.${key}`]])) as Record<(typeof RUNAWAY_FIELDS)[number]['field'], string[]>),
}

type Tree = Record<string, unknown>
const isTree = (x: unknown): x is Tree => x !== null && typeof x === 'object' && !Array.isArray(x)

/** Removes the leaf at the path, then the parent objects that this removal emptied; false when there was no such leaf. */
function deletePath(root: Tree, path: string[]): boolean {
  const [head, ...rest] = path
  if (rest.length === 0) {
    if (!(head in root)) return false
    delete root[head]
    return true
  }
  const child = root[head]
  if (!isTree(child) || !deletePath(child, rest)) return false
  if (Object.keys(child).length === 0) delete root[head]
  return true
}

function setPath(root: Tree, path: string[], value: unknown): void {
  const [head, ...rest] = path
  if (rest.length === 0) {
    root[head] = value
    return
  }
  const child = isTree(root[head]) ? root[head] : {}
  root[head] = child
  setPath(child, rest, value)
}

const getPath = (root: Tree, path: string[]): unknown => path.reduce<unknown>((node, key) => (isTree(node) ? node[key] : undefined), root)

/**
 * Maps validated form values to a preset spec. Without `original` (a new preset) it is sparse: only the set
 * fields, as SessionSpec keys, a set field that is empty omitted (clearing means unset), so no key is ever null.
 * With `original` (an edit or copy) it starts from a deep copy of it and rewrites every path the set fields own
 * (a cleared one is removed), so keys the form does not model pass through unchanged.
 */
export function toPresetSpec(v: FormValues, setKeys: ReadonlySet<SetKey>, original?: Partial<SessionSpec>): Partial<SessionSpec> {
  const sparse = sparsePresetSpec(v, setKeys) as Tree
  if (original === undefined) return sparse as Partial<SessionSpec>
  const merged = structuredClone(original) as Tree
  for (const key of setKeys) {
    for (const path of OWNED_PATHS[key].map((p) => p.split('.'))) {
      deletePath(merged, path)
      const value = getPath(sparse, path)
      if (value !== undefined) setPath(merged, path, value)
    }
  }
  return merged as Partial<SessionSpec>
}

function sparsePresetSpec(v: FormValues, setKeys: ReadonlySet<SetKey>): Partial<SessionSpec> {
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
  if (setKeys.has('autocloseAfter')) spec.autoclose_after_seconds = int(v.autocloseAfter)
  const reminder = setKeys.has('inactivityReminder') ? int(v.inactivityReminder) : undefined
  const close = setKeys.has('inactivityClose') ? int(v.inactivityClose) : undefined
  const inactivity = {
    ...(reminder !== undefined && { reminder_seconds: reminder }),
    ...(close !== undefined && { close_seconds: close }),
  }
  if (Object.keys(inactivity).length > 0) spec.inactivity = inactivity
  const fiveHour = setKeys.has('quotaFiveHour') ? int(v.quotaFiveHour) : undefined
  const sevenDay = setKeys.has('quotaSevenDay') ? int(v.quotaSevenDay) : undefined
  const quota = {
    ...(fiveHour !== undefined && { five_hour_pct: fiveHour }),
    ...(sevenDay !== undefined && { seven_day_pct: sevenDay }),
  }
  if (Object.keys(quota).length > 0) spec.usage_quota = quota
  const runaway: Record<string, number> = {}
  for (const { field, key } of RUNAWAY_FIELDS) {
    const n = setKeys.has(field) ? int(v[field]) : undefined
    if (n !== undefined) runaway[key] = n
  }
  if (Object.keys(runaway).length > 0) spec.runaway = runaway
  if (setKeys.has('reuseRunningAgent')) spec.reuse_running_agent = v.reuseRunningAgent
  if (setKeys.has('sessionMessaging') && v.sessionMessaging) spec.session_messaging = true
  if (setKeys.has('kubeClusterAccess') && v.kubeClusterAccess) spec.kube_cluster_access = true
  if (setKeys.has('kubeNamespaceAccess') && v.kubeNamespaceAccess.length > 0) {
    const rows = [...v.kubeNamespaceAccess].sort((a, b) => (a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0))
    spec.kube_namespace_access = Object.fromEntries(rows.map((r) => [r.namespace, canonicalTiers(r.tiers)])) as NonNullable<SessionSpec['kube_namespace_access']>
  }
  if (setKeys.has('docker') && v.docker) {
    spec.docker = true
    if (v.dockerStorage !== '') spec.docker_storage = v.dockerStorage
    if (v.dockerCpu !== '') spec.docker_cpu = v.dockerCpu
    if (v.dockerMemory !== '') spec.docker_memory = v.dockerMemory
  }
  if (setKeys.has('backup') && v.backup.length > 0) spec.backup = v.backup.map(entryFromRow)
  if (setKeys.has('retrospective') && v.retrospective) spec.retrospective = true
  if (setKeys.has('handoffProfile') && str(v.handoffProfile) !== undefined) spec.handoff_profile = v.handoffProfile as NonNullable<SessionSpec['handoff_profile']>
  const wrapper = wrapperFromValues(v, setKeys)
  if (Object.keys(wrapper).length > 0) spec.wrapper = wrapper
  return Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)) as Partial<SessionSpec>
}

/** The request form of a row. */
function envEntry(r: EnvRow): EnvEntry {
  return r.vault ? { vault: r.vault.vault, env: r.vault.env } : { value: r.value, expand: r.expand }
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
    ['managed_settings', json('managedSettings')],
  ]))
  return w
}
