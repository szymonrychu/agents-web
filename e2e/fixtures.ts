/**
 * Canned answers of every backend the admin screens read. Typed against the generated schema types (type-only
 * imports), so a schema change breaks the typecheck instead of silently emptying the smoke. Every list has two rows,
 * one with a long unbroken name; Switches appear in both states (schedules, backups cleanup).
 */
import type { components as Orchestrator } from '../src/api/schema'
import type { components as History } from '../src/api/history-schema'
import type { components as Matrix } from '../src/api/matrix-schema'
import type { components as Schedules } from '../src/api/schedules-schema'
import type { components as Taskboard } from '../src/api/taskboard-schema'
import type { components as Usage } from '../src/api/usage-schema'
import type { components as Vault } from '../src/api/vault-schema'
import type { components as Webhooks } from '../src/api/webhooks-schema'
import type { DeviceView } from '../src/devices/api'
import type { ProjectSummary } from '../src/projects/api'
import type { Task } from '../src/tasks/api'

type O = Orchestrator['schemas']

/** The base path of every backend, as the deployed config.json lists them. */
export const BASES = {
  orchestrator: '/api/v1',
  webhooks: '/webhooks/api/v1',
  schedules: '/schedules/api/v1',
  matrix: '/matrix/api/v1',
  usage: '/usage/v1',
  taskboard: '/taskboard/api/v1',
  history: '/history/v1',
  devices: '/app/admin/v1',
  vault: '/vault/v1',
  mindmap: '/mindmap/api/v1',
} as const

export interface Fixture {
  method: string
  path: string | RegExp
  /** The JSON answer, or a function of the request URL. */
  body: ((url: URL) => unknown) | object
}

export const LONG = 'a-very-long-schedule-name-without-spaces-0123456789'
const T0 = '2026-11-01T10:00:00Z'
const T1 = '2026-11-02T11:30:00Z'
const FUTURE = '2030-01-01T09:00:00Z'

// ---------------------------------------------------------------- orchestrator

const session = (id: string, slug: string): O['SessionView'] => ({
  backup: { last_transcripts_backup: null, reason: null, transcripts: false, workdir: false },
  closes_at: null,
  created_at: T0,
  desired: 'active',
  extra_projects: [],
  generation: 1,
  hive: false,
  id,
  init_edited_since_run: false,
  labels: ['alpha'],
  leader_agent_id: `${id}-a1`,
  leader_epoch: 1,
  leader_reason: null,
  leader_since: T0,
  max_replicas: 1,
  observed_generation: 1,
  preset_id: 'p1',
  preset_name: 'Default preset',
  project: 'default',
  slug,
  spec: { env: {}, init_scripts: [], max_attempts: 3, peers: false, replicas: 1, static: false, workdir: '/workspace' },
  static: false,
  status: {},
  summary: {
    attention_agents: 0,
    auth_failed_agents: 0,
    auto_compact_pct: 80,
    bootstrap_failed_agents: 0,
    bootstrap_failures: [],
    context_pct_max: 12,
    failed: 0,
    oldest_queued_at: null,
    permission_unavailable_agents: 0,
    queued: 0,
    ready: 1,
    ready_with_session: 1,
    replicas: 1,
    start_state: 'ready',
    state: 'waiting',
  },
  vault: {},
})
const sessions = [session('s1', 'alpha-session'), session('s2', 'a-very-long-session-slug-without-spaces-0123456789')]

const agent = (sessionId: string): O['AgentView'] => ({
  attention: null,
  bootstrap: null,
  bootstrap_failure: null,
  context: null,
  context_pct: 12,
  current_turn_id: null,
  free_since: T0,
  gone: false,
  id: `${sessionId}-a1`,
  leader: true,
  ordinal: 0,
  peers: 0,
  pod_name: `${sessionId}-pod-0`,
  ready: true,
  state: 'idle',
})

const presets: O['PresetView'][] = [
  { created_at: T0, extra_projects: [], id: 'p1', is_default: true, labels: [], name: 'Default preset', privileged: [], project: 'default', spec: {}, superleader_manageable: false, updated_at: T0, vault_reattach: [] },
  { created_at: T0, extra_projects: [], id: 'p2', is_default: false, labels: [], name: 'Reviewer', privileged: [], project: 'default', spec: {}, superleader_manageable: false, updated_at: T0, vault_reattach: [] },
]

const projects: O['ProjectView'][] = [
  { archived: false, created_at: T0, description: 'The default project', name: 'Default', presets: 2, sessions: 2, slug: 'default', updated_at: T0 },
  { archived: false, created_at: T0, description: 'https://example.org/a/very/long/unbroken/description/path/0123456789abcdef', name: 'A very long project name without spaces 0123456789', presets: 0, sessions: 0, slug: 'long-project', updated_at: T0 },
]

const proposals: O['ProposalView'][] = [
  { closed_at: null, created_at: T0, expires_at: FUTURE, id: 1, kind: 'preset', proposer_slug: 'alpha-session', proposer_superleader: false, revision: 1, revisions: [], stale: false, status: 'open', target_id: 'p1', target_name: 'Default preset', updated_at: T0 },
  { closed_at: null, created_at: T1, expires_at: FUTURE, id: 2, kind: 'schedule', proposer_slug: 'a-very-long-session-slug-without-spaces-0123456789', proposer_superleader: false, revision: 2, revisions: [], stale: false, status: 'rework', target_id: 'x', target_name: LONG, updated_at: T1 },
]

const archives: O['ArchivePage'] = {
  items: [
    { key: 'archives/alpha.tar.zst', last_modified: T0, name: 'alpha.tar.zst', protected: false, referenced_by: ['alpha-session'], size: 123456789 },
    { key: 'archives/long.tar.zst', last_modified: T1, name: 'a-very-long-archive-name-without-spaces-0123456789.tar.zst', protected: true, referenced_by: [], size: 2048 },
  ],
  next_cursor: null,
}

const policy: O['SweepPolicyView'] = { dry_run: false, enabled: true, grace_seconds: 3600, interval_seconds: 86400, keep_newest: 3, retention_days: 30 }
const cleanup: O['CleanupSettingsView'] = { defaults: policy, last_sweep: null, policy, run_pending: false, run_requested_at: null, source: 'database', updated_at: T0 }

/** The app reads only `usage` from /meta on the Usage screen. */
const meta: Pick<O['Meta'], 'usage'> = { usage: { configured: true, quota_default_pct: 100 } }

const fileListing = (sessionId: string): O['FileListing'] => ({ agent_id: `${sessionId}-a1`, entries: [], next_offset: null, path: '', root: '/workspace', session_id: sessionId })
const noEvents: O['EventsPage'] = { events: [], has_more_before: false, next_after_id: null }
const noTerminals: O['TerminalList'] = { terminals: [], unavailable_agents: [] }

// ------------------------------------------------------------------- schedules

const run = (scheduleId: string): Schedules['schemas']['RunView'] => ({
  chain_depth: 0, chain_ref: null, chain_source: null, chain_status: null, chained_from: null, created_at: T0, finished_at: T1, fire_time: T0,
  id: `run-${scheduleId}`, message_id: null, previous_name: null, previous_status: null, reason: null, reuse: null, schedule_id: scheduleId,
  session_id: null, session_slug: null, started_at: T0, status: 'succeeded', then_schedule_ids: null, trigger: 'cron', updated_at: T1,
})
const schedule = (id: string, name: string, enabled: boolean): Schedules['schemas']['ScheduleView'] => ({
  created_at: T0, cron: '0 9 * * 1-5', enabled, id, last_run: run(id), name, next_fires: [FUTURE], preset_id: 'p1', prompt: 'Check the board',
  then_schedule_ids: [], timezone: 'Europe/Warsaw', updated_at: T0,
})
const schedules = [schedule('sc1', 'Morning check', true), schedule('sc2', LONG, false)]

// -------------------------------------------------------------------- webhooks

const endpoint = (id: number, suffix: string): Webhooks['schemas']['EndpointView'] => ({
  auth_header: null, auth_mode: 'hmac', created_at: T0, credentials_rotated_at: T1, filters: { allow: [], deny: [] }, has_secret: true,
  hmac_algorithm: 'sha256', hmac_prefix: null, hmac_timestamp_header: null, id, preset_id: 'p1', prompt_template: null, suffix,
  then_schedule_ids: [], type: 'github', updated_at: T0, url: `https://example.org/webhooks/in/${suffix}`, username: null,
})
const endpoints = [endpoint(1, 'alpha'), endpoint(2, 'a-very-long-endpoint-suffix-without-spaces-0123456789')]
const webhookEvent = (id: number, suffix: string): Webhooks['schemas']['EventView'] => ({
  action: 'opened', author: 'octocat', chain_status: null, dedup_key: `k${id}`, deliveries: 1, duplicate_of: null, endpoint_id: id, endpoint_suffix: suffix,
  finished_at: null, id, kind: 'pr', message_id: null, number: id, preset_id: 'p1', reason: null, received_at: T0, repo: 'example/repo',
  session_id: null, session_slug: null, source: 'github', started_at: null, status: 'queued', then_schedule_ids: null, title: 'Fix the layout',
  type: 'github', update_of: null, updated_at: T0, url: null,
})
const webhookMeta: Webhooks['schemas']['Meta'] = {
  filter_fields: { github: ['repo', 'author'] },
  ingest_path_prefix: '/webhooks/in',
  limits: { auth_failures_per_minute: 10, max_body_bytes: 1048576, max_in_progress: 5, max_in_progress_per_endpoint: 2, max_queue: 100, run_timeout_seconds: 3600 },
  public_base_url: 'https://example.org',
  types: ['github'],
}

// ---------------------------------------------------------------------- matrix

const room = (id: string, name: string, state: 'allowed' | 'denied'): Matrix['schemas']['RoomView'] => ({
  access: { reason: null, rule_id: null, state },
  agent_aliases: [], agents_may_initiate: false, agents_may_send_files: false, alias: null, anonymize_names: false, binding: null,
  effective_preset_id: 'p1', effective_trigger: 'mention', encrypted: false, kind: 'dm', last_event_at: T1, member_count: 2, membership: 'join',
  message_request: false, name,
  pending: { allowed: true, denied_count: 0, denied_senders: [], invited: false, inviter: null, last_denied_at: null, message_request: false },
  preset_id: 'p1', queued: 0, room_id: id, session: null, trigger: null,
})
const rooms = [room('!a:example.org', 'Alice', 'allowed'), room('!b:example.org', 'a-very-long-room-name-without-spaces-0123456789', 'denied')]
const matrixMeta: Matrix['schemas']['MetaView'] = {
  default_policy: 'deny', group_trigger: 'mention', homeserver_url: 'https://matrix.example.org', rule_kinds: {},
  sync: { healthy: true, last_sync_at: T1 }, user_id: '@agents-orchestrator-bot:matrix.example.org',
}
const matrixSettings: Matrix['schemas']['SettingsView'] = { default_preamble: 'You are a helpful agent.', default_preset_id: 'p1', preamble: null }

// --------------------------------------------------------------------- history

const hist = (id: number, slug: string): History['schemas']['SessionSummary'] => ({
  bytes: 4096, created_at: T0, created_by_service: null, created_by_session: null, discarded_at: T1, hits: null, id, matches: [],
  preset_id: 'p1', preset_name: 'Default preset', record_counts: { message: 12, event: 40 }, session_id: `h${id}`, slug,
})
const historySessions = [hist(1, 'alpha-session'), hist(2, 'a-very-long-session-slug-without-spaces-0123456789')]
const retention: History['schemas']['RetentionView'] = { last_sweep_at: null, last_sweep_deleted: null, retention_days: 90, updated_at: T0 }

// --------------------------------------------------------------------- devices

const devices: DeviceView[] = [
  { device_id: 'd1', name: 'Boox Tab', plugin: 'sketch', created_at: T0, revoked_at: null, state: 'active', paired_at: T1, code_expires_at: null, code_status: 'redeemed' },
  { device_id: 'd2', name: 'a-very-long-device-name-without-spaces-0123456789', plugin: 'sketch', created_at: T0, revoked_at: null, state: 'pending', paired_at: null, code_expires_at: FUTURE, code_status: 'pending' },
]

// ----------------------------------------------------------------------- vault

const entry = (id: string, name: string, secret: boolean): Vault['schemas']['EntryView'] => ({
  attachments_count: 1, behind_count: 0, created_at: T0, description: 'Credentials for the example service', id,
  envs: [secret ? { env: 'EXAMPLE_TOKEN', protected: true, updated_at: T0, value: null } : { env: 'EXAMPLE_URL', protected: false, updated_at: T0, value: 'https://example.org' }],
  labels: ['project:default'], name, pinned_sessions_count: 0, updated_at: T0, version: 1,
})
const entries = [entry('e1', 'example-token', true), entry('e2', 'a-very-long-entry-name-without-spaces-0123456789', false)]

// ----------------------------------------------------------------------- usage

const usageCurrent: Usage['schemas']['CurrentView'] = {
  last_probe: null,
  last_sample: null,
  windows: {
    five_hour: { observed_at: T1, percent: 42, resets_at: FUTURE, source: 'statusline', stale: false },
    seven_day: { observed_at: T1, percent: 17, resets_at: FUTURE, source: 'statusline', stale: false },
  },
}
const usageHistory: Usage['schemas']['HistoryView'] = { bucket_seconds: 3600, from: T0, points: [], to: T1 }
const usageSessions: Usage['schemas']['SessionsView'] = { from: T0, marks: [], to: T1, truncated: false }

// ------------------------------------------------------------------- taskboard

const task = (key: string, title: string, labels: string[]): Task => ({
  key, title, body: '', kind: 'task', project: 'default', status: 'open', labels, assignee_session: null, blocked: false, spec: null, step: null,
  refs: [], model: null, depends_on: [], open_decisions: 0, waiting_sessions: [], todo: [], decisions: [], comments: [], events: [],
  url: `https://example.org/tasks/${key}`, version: 1, created_at: T0, updated_at: T1,
})
const tasks = [task('T-1', 'Fix the phone layout', ['ui']), task('T-2', 'A-very-long-task-title-without-any-spaces-0123456789-0123456789', ['a-very-long-label-0123456789'])]

const spec = (key: string, name: string, title: string): Taskboard['schemas']['SpecSummary'] => ({
  assignee_session: null, assignee_slug: null, created_at: T0, created_by: null, key, labels: ['ui'], name, preset_id: null, project: 'default',
  status: 'draft', title, updated_at: T1, url: `https://example.org/specs/${key}`, version: 1,
})
const specs = [spec('S-1', 'phone-layout', 'Phone layout'), spec('S-2', 'a-very-long-spec-name-without-spaces-0123456789', 'A very long spec title that wraps')]

const projectSummary: ProjectSummary[] = [
  { project: 'default', open_tasks: 2, waiting_decisions: 0 },
  { project: 'long-project', open_tasks: 0, waiting_decisions: 0 },
]
const specQueue: Taskboard['schemas']['SpecQueue'] = {
  projects: [
    { items: [], max_active_sessions: null, max_usage_pct: null, project: 'default', state: 'off' },
    { items: [], max_active_sessions: null, max_usage_pct: null, project: 'long-project', state: 'off' },
  ],
}

// ---------------------------------------------------------------------- routes

const get = (path: string | RegExp, body: Fixture['body']): Fixture => ({ method: 'GET', path, body })
const O_ = BASES.orchestrator
const sessionPath = (tail: string) => new RegExp(`^${O_}/sessions/[^/]+/${tail}$`)
const idOf = (url: URL) => url.pathname.split('/')[4] ?? ''

export const routes: Fixture[] = [
  get(`${O_}/sessions`, sessions),
  get(sessionPath('agents'), (url) => [agent(idOf(url))]),
  get(sessionPath('events'), noEvents),
  get(sessionPath('files'), (url) => fileListing(idOf(url))),
  get(sessionPath('terminals'), noTerminals),
  get(sessionPath('messages'), []),
  get(`${O_}/presets`, presets),
  get(`${O_}/projects`, projects),
  get(`${O_}/proposals`, proposals),
  get(`${O_}/meta`, meta),
  get(`${O_}/cache/archives`, archives),
  get(`${O_}/cache/cleanup/settings`, cleanup),

  get(`${BASES.schedules}/schedules`, schedules),

  get(`${BASES.webhooks}/endpoints`, endpoints),
  get(`${BASES.webhooks}/events`, [webhookEvent(1, 'alpha'), webhookEvent(2, 'a-very-long-endpoint-suffix-without-spaces-0123456789')]),
  get(`${BASES.webhooks}/meta`, webhookMeta),

  get(`${BASES.matrix}/meta`, matrixMeta),
  get(`${BASES.matrix}/rooms`, rooms),
  get(`${BASES.matrix}/settings`, matrixSettings),

  get(`${BASES.history}/sessions`, historySessions),
  get(`${BASES.history}/settings`, retention),

  get(`${BASES.devices}/devices`, devices),

  get(`${BASES.vault}/entries`, entries),

  get(`${BASES.usage}/current`, usageCurrent),
  get(`${BASES.usage}/history`, usageHistory),
  get(`${BASES.usage}/sessions`, usageSessions),

  // The shell's attention poll asks for waiting tasks only: none wait.
  get(`${BASES.taskboard}/tasks`, (url) =>
    url.searchParams.get('waiting') === 'true' ? { items: [], next_cursor: null } : { items: tasks, next_cursor: null }),
  get(`${BASES.taskboard}/specs`, { items: specs, next_cursor: null }),
  get(`${BASES.taskboard}/specs/queue`, specQueue),
  get(`${BASES.taskboard}/projects/summary`, projectSummary),
]
