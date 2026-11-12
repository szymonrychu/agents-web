// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AgentView, SessionView, Meta, PresetView } from './api/client'
import type { StreamOptions } from './api/stream'
import App from './App'
import { BACKEND_MENUS } from './backends/registry'
import { loadConfig, resetConfig } from './config/backends'
import { theme } from './theme'
import { proposal } from './proposals/proposalFixture'
import { HOOK_EVENTS_FIXTURE } from './hooks/testEvents'

const api = vi.hoisted(() => ({ listSessions: vi.fn(), listAgents: vi.fn(), getMeta: vi.fn(), listPresets: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn(), restartSession: vi.fn() }))
const proposals = vi.hoisted(() => ({ listProposals: vi.fn(), getProposal: vi.fn(), reviewProposal: vi.fn() }))
const stream = vi.hoisted(() => ({ opts: null as null | StreamOptions, close: vi.fn() }))

vi.mock('./api/client', async (orig) => ({ ...(await orig<typeof import('./api/client')>()), ...api, statusStreamUrl: () => '/api/v1/stream' }))
vi.mock('./proposals/api', () => proposals)
vi.mock('./api/terminals', async (orig) => ({ ...(await orig<typeof import('./api/terminals')>()), listTerminals: async () => ({ terminals: [], unavailable_agents: [] }) }))
vi.mock('./api/stream', async (orig) => ({
  ...(await orig<typeof import('./api/stream')>()),
  openStream: (_url: string, opts: StreamOptions) => {
    // The chat view opens its own stream; keep the session status stream.
    if (opts.eventNames?.includes('session_status')) stream.opts = opts
    return { close: stream.close }
  },
}))

/** jsdom has no layout: the workspace's panel library needs observers and a box. */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

const summary = (o: Partial<SessionView['summary']> = {}): SessionView['summary'] => ({
  auto_compact_pct: 80, context_pct_max: 40, attention_agents: 0, bootstrap_failed_agents: 0, bootstrap_failures: [], start_state: 'ready', permission_unavailable_agents: 0, failed: 0, oldest_queued_at: null, queued: 0, ready: 2, replicas: 3, state: 'working', ...o,
})
const session = (id: string, slug: string, s: Partial<SessionView['summary']> = {}): SessionView =>
  ({ backup: { workdir: false, transcripts: false, reason: 'no_session_cache', last_transcripts_backup: null }, created_at: '2026-01-01T00:00:00Z', desired: 'active', generation: 1, id, observed_generation: 1, slug, spec: {} as SessionView['spec'], status: {}, summary: summary(s) }) as SessionView
const agent = (id: string, ordinal: number): AgentView => ({
  context: { used_percentage: 25, used_tokens: 1, window_tokens: 4 }, current_turn_id: null, free_since: null, gone: false, id, ordinal, leader: false, context_pct: null, peers: 0, pod_name: `alpha-${ordinal}`, ready: true, state: 'busy', attention: null, bootstrap: null, bootstrap_failure: null,
})
const meta = (): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: false, max_bytes: 0 }, kube_cluster_access: { available: false }, kube_namespace_access: { available: false, namespaces: [], tiers: [] }, docker: { available: false, max_cpu: '8', max_memory: '16Gi', max_storage: '100Gi', storage: '30Gi' }, permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }], caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, usage: { configured: false, quota_default_pct: 100 }, inactivity: { reminder_seconds: 0, close_seconds: 0, handoff_seconds: 300 }, models: ['opus', 'sonnet', 'haiku'], efforts: ['low', 'medium', 'high', 'max'],
}) as Meta

const preset = (id: string, name: string, is_default = false): PresetView => ({ created_at: '2026-01-01T00:00:00Z', extra_projects: [], id, is_default, labels: [], name, privileged: [], project: 'default', spec: {}, superleader_manageable: false, updated_at: '2026-01-01T00:00:00Z', vault_reattach: [] })
const PRESETS = [preset('p-default', 'Default', true), preset('p-big', 'Big box')]

function emit(type: string, data: unknown) {
  act(() => stream.opts!.onEvent(data, { type, id: '1' }))
}

function mount(path = '/') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const tabs = () => screen.getAllByRole('tab')
const selectedTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopObserver)
  localStorage.clear()
  setViewport(1400)
  stream.opts = null
  api.listSessions.mockResolvedValue([session('c2', 'beta', { state: 'waiting', ready: 1, replicas: 1, context_pct_max: 10 }), session('c1', 'alpha')])
  api.listAgents.mockImplementation(async (id: string) => (id === 'c1' ? [agent('a0', 0), agent('a1', 1)] : []))
  api.getMeta.mockResolvedValue(meta())
  api.listPresets.mockResolvedValue(PRESETS)
  proposals.listProposals.mockResolvedValue([])
  // the review dialog fetches the full view of the proposal it shows
  proposals.getProposal.mockImplementation(async (id: number) => ((await proposals.listProposals('active')) as { id: number }[]).find((p) => p.id === id))
})
afterEach(() => {
  cleanup()
  resetConfig()
  delete BACKEND_MENUS.second
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('App', () => {
  test('proposals_auto_open_shows_the_dialog_and_the_chip_reopens_it', async () => {
    proposals.listProposals.mockImplementation(async (status: string) => (status === 'active' ? [proposal()] : []))
    mount()
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: /Proposals, 1 waiting/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'preset worker' })).toBeTruthy()
  })

  test('proposals_chip_opens_the_page_when_several_wait', async () => {
    proposals.listProposals.mockImplementation(async (status: string) => (status === 'active' ? [proposal({ status: 'stale', stale: true }), proposal({ id: 9, status: 'stale', stale: true })] : []))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Proposals, 2 waiting/ }))
    expect(await screen.findByRole('heading', { name: 'Proposals' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a fresh proposal never replaces an open review; it opens after the review closes', async () => {
    let active = [proposal()]
    // every poll is a fresh response, as from the server
    proposals.listProposals.mockImplementation(async (status: string) => (status === 'active' ? [...active] : []))
    mount()
    const dialog = await screen.findByRole('dialog')
    const model = within(dialog).getByText('model').closest('[data-testid="item-card"]') as HTMLElement
    fireEvent.click(within(model).getByRole('button', { name: 'Approve' }))
    active = [proposal(), proposal({ id: 9, target_name: 'other' })]
    const polls = proposals.listProposals.mock.calls.length
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(proposals.listProposals.mock.calls.length).toBeGreaterThan(polls))
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'preset worker' })).toBeTruthy()
    expect(within(model).getByRole('button', { name: 'Approve' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(await screen.findByRole('heading', { name: 'preset other' })).toBeTruthy()
  })

  test('a submitted review refreshes the proposals chip at once', async () => {
    let active = [proposal()]
    proposals.listProposals.mockImplementation(async (status: string) => (status === 'active' ? active : []))
    proposals.reviewProposal.mockImplementation(async () => {
      active = []
      return proposal({ status: 'applied' })
    })
    mount()
    await screen.findByRole('dialog')
    // the modal dialog hides the top bar from the accessibility tree
    expect(screen.getByRole('button', { name: /Proposals, 1 waiting/, hidden: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))
    expect(await screen.findByText(/Review submitted/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Proposals, \d+ waiting/, hidden: true })).toBeNull())
  })

  test('last_talked_superleader_tab_is_first', async () => {
    const zulu = { ...session('c3', 'zulu'), spec: { session_messaging: true }, last_user_message_at: '2026-05-01T10:00:00Z' } as SessionView
    api.listSessions.mockResolvedValue([session('c2', 'beta'), session('c1', 'alpha'), zulu])
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(3))
    expect(tabs().map((t) => /^(zulu|alpha|beta)/.exec(t.textContent ?? '')?.[1])).toEqual(['zulu', 'alpha', 'beta'])
  })

  test('default_selection_does_not_jump_when_pins_change', async () => {
    const gamma = { ...session('c3', 'gamma'), spec: { session_messaging: true } } as SessionView
    api.listSessions.mockResolvedValue([session('c2', 'beta'), session('c1', 'alpha'), gamma])
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(3))
    expect(selectedTab()?.textContent).toContain('alpha')
    emit('session_status', { session: { ...gamma, last_user_message_at: '2026-05-01T10:00:00Z' } })
    await waitFor(() => expect(tabs()[0].textContent).toContain('gamma'))
    expect(tabs().map((t) => /^(gamma|alpha|beta)/.exec(t.textContent ?? '')?.[1])).toEqual(['gamma', 'alpha', 'beta'])
    expect(selectedTab()?.textContent).toContain('alpha')
  })

  test('pin_moves_when_the_pinned_superleader_is_discarded', async () => {
    const lead = (id: string, slug: string, at: string) => ({ ...session(id, slug), spec: { session_messaging: true }, last_user_message_at: at }) as SessionView
    api.listSessions.mockResolvedValue([lead('c1', 'alpha', '2026-05-01T10:00:00Z'), lead('c2', 'beta', '2026-05-02T10:00:00Z'), session('c3', 'gamma')])
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(3))
    const names = () => tabs().map((t) => /^(alpha|beta|gamma)/.exec(t.textContent ?? '')?.[1])
    expect(names()).toEqual(['beta', 'alpha', 'gamma'])
    emit('session_removed', { session_id: 'c2' })
    await waitFor(() => expect(names()).toEqual(['alpha', 'beta', 'gamma']))
  })

  test('top_bar_replaces_ribbon', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    expect(tabs().map((t) => t.textContent)).toEqual(['alpha2/340%', 'beta1/110%'])
    expect(within(tabs()[0]).getByRole('img', { name: 'state working' })).toBeTruthy()
    expect(within(tabs()[1]).getByRole('img', { name: 'state idle' })).toBeTruthy()
    expect(within(tabs()[0]).getByTestId('context-gauge-tick')).toBeTruthy()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { name: 'alpha' })).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByTestId('ribbon-aside')).toBeNull()
    expect(screen.queryByTestId('ribbon-drawer')).toBeNull()
    expect(screen.queryByTestId('session-row-alpha')).toBeNull()
  })

  test('only_active_session_workspace_mounted', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    const workspaces = () => screen.queryAllByTestId('workspace').map((w) => w.getAttribute('data-session'))
    expect(workspaces()).toEqual(['c1'])
    const main = screen.getByRole('main')
    expect(within(main).getByRole('button', { name: 'Minimize Files' })).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'Minimize Chat' })).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'Minimize Terminal' })).toBeTruthy()
    expect(within(main).getByRole('heading', { name: 'alpha' })).toBeTruthy()
    fireEvent.click(tabs()[1])
    expect(workspaces()).toEqual(['c2'])
    expect(within(main).queryByRole('heading', { name: 'alpha' })).toBeNull()
    expect(within(main).getByRole('heading', { name: 'beta' })).toBeTruthy()
    // The layout of the tab left behind is remembered for when it is shown again.
    fireEvent.click(within(main).getByRole('button', { name: 'Minimize Files' }))
    fireEvent.click(tabs()[0])
    expect(workspaces()).toEqual(['c1'])
    expect(within(main).getByRole('button', { name: 'Minimize Files' })).toBeTruthy()
    fireEvent.click(tabs()[1])
    expect(within(main).getByRole('button', { name: 'Restore Files' })).toBeTruthy()
  })

  test('top_bar_on_phone_layout', async () => {
    setViewport(400)
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  test('first_tab_selected_by_default', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    expect(selectedTab()?.textContent).toContain('alpha')
    fireEvent.click(tabs()[1])
    expect(selectedTab()?.textContent).toContain('beta')
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'beta' })).toBeTruthy()
    emit('session_removed', { session_id: 'c2' })
    // A removed session stays as a discarded tab until it is dismissed.
    await waitFor(() => expect(within(tabs()[1]).getByRole('img', { name: 'state discarded' })).toBeTruthy())
    expect(tabs()).toHaveLength(2)
    expect(await screen.findByText('Session beta was discarded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss beta' }))
    await waitFor(() => expect(tabs()).toHaveLength(1))
    expect(selectedTab()?.textContent).toContain('alpha')
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'alpha' })).toBeTruthy()
    emit('session_removed', { session_id: 'c1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss alpha' }))
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    emit('session_status', { session: session('c0', 'aaa') })
    await waitFor(() => expect(selectedTab()?.textContent).toContain('aaa'))
  })

  test('empty_state_keeps_new_session_button', async () => {
    api.listSessions.mockResolvedValue([])
    mount()
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
  })

  test('list_error_is_shown', async () => {
    api.listSessions.mockRejectedValue(new Error('boom'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
    expect(screen.queryByText('No sessions yet')).toBeNull()
  })

  test('applies_stream_deltas_to_tabs', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    emit('session_status', { session: session('c1', 'alpha', { state: 'waiting', context_pct_max: 77 }) })
    expect(within(tabs()[0]).getByRole('img', { name: 'state idle' })).toBeTruthy()
    expect(within(tabs()[0]).getByLabelText('context 77%')).toBeTruthy()
    emit('session_status', { session: session('c3', 'gamma', { state: 'booting', ready: 0 }) })
    expect(tabs().map((t) => t.textContent?.match(/^[a-z]+/)?.[0])).toEqual(['alpha', 'beta', 'gamma'])
    emit('snapshot', { sessions: [{ session: session('c9', 'omega'), agents: [] }] })
    expect(tabs().map((t) => t.textContent?.match(/^[a-z]+/)?.[0])).toEqual(['omega'])
  })

  test('hamburger_opens_sessions_menu_with_settings', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const list = screen.getByRole('list', { name: 'Sessions' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['alpha', 'beta'])
    expect(within(screen.getByRole('region', { name: 'Settings' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sessions', 'Presets', 'Proposals', 'Backups', 'Projects'])
    fireEvent.click(within(list).getAllByRole('button')[1])
    await waitFor(() => expect(selectedTab()?.textContent).toContain('beta'))
  })

  test('second_backend_entry_only_when_configured', async () => {
    BACKEND_MENUS.second = [{ id: 'second', label: 'Second', order: 50, backend: 'second', render: () => <p>second page</p> }]
    const settings = () => within(screen.getByRole('region', { name: 'Settings' }))
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(settings().getAllByRole('button').map((b) => b.textContent)).toEqual(['Sessions', 'Presets', 'Proposals', 'Backups', 'Projects'])
    first.unmount()
    cleanup()
    const backends = [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'second', label: 'S', basePath: '/second' }]
    await loadConfig((async () => ({ ok: true, json: async () => ({ backends }) })) as unknown as typeof fetch)
    mount()
    const main = screen.getByRole('main')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(settings().getAllByRole('button').map((b) => b.textContent)).toEqual(['Sessions', 'Presets', 'Proposals', 'Backups', 'Second', 'Projects'])
    fireEvent.click(settings().getByRole('button', { name: 'Second' }))
    expect(await within(main).findByText('second page')).toBeTruthy()
  })

  test('unregistered_backend_warns_once_across_rerenders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const backends = [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'ghost', label: 'G', basePath: '/ghost' }]
    await loadConfig((async () => ({ ok: true, json: async () => ({ backends }) })) as unknown as typeof fetch)
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    fireEvent.click(tabs()[1])
    emit('snapshot', { sessions: [{ session: session('c9', 'omega'), agents: [] }] })
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('ghost'))).toHaveLength(1)
    warn.mockRestore()
  })

  test('sessions entry', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    const main = screen.getByRole('main')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(within(screen.getByRole('region', { name: 'Settings' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sessions', 'Presets', 'Proposals', 'Backups', 'Projects'])
    fireEvent.click(within(screen.getByRole('region', { name: 'Settings' })).getByRole('button', { name: 'Sessions' }))
    expect(await within(main).findByRole('heading', { name: 'Sessions' })).toBeTruthy()
    // Open selects that session and returns to its workspace.
    fireEvent.click(await within(main).findByRole('button', { name: 'Open beta' }))
    await waitFor(() => expect(within(main).getByRole('heading', { name: 'beta' })).toBeTruthy())
    expect(selectedTab()?.textContent).toContain('beta')
  })

  test('presets_from_settings_menu', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    const main = screen.getByRole('main')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Settings' })).getByRole('button', { name: 'Presets' }))
    expect(await within(main).findByRole('heading', { name: 'Presets' })).toBeTruthy()
    expect(await within(main).findByText('Big box')).toBeTruthy()
    expect(within(main).queryByTestId('workspace')).toBeNull()
    // The top bar stays visible.
    expect(tabs()).toHaveLength(2)
    fireEvent.click(within(main).getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(within(main).queryByRole('heading', { name: 'Presets' })).toBeNull())
    expect(within(main).getByRole('heading', { name: 'alpha' })).toBeTruthy()
    expect(selectedTab()?.textContent).toContain('alpha')
    // Choosing a session in the menu also leaves the page.
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Settings' })).getByRole('button', { name: 'Presets' }))
    expect(await within(main).findByRole('heading', { name: 'Presets' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('button')[1])
    await waitFor(() => expect(within(main).queryByRole('heading', { name: 'Presets' })).toBeNull())
    await waitFor(() => expect(within(main).getByRole('heading', { name: 'beta' })).toBeTruthy())
  })

  test('create_and_discard_from_top_bar', { timeout: 15000 }, async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(await screen.findByRole('combobox', { name: 'Preset' })).toBeTruthy()
    expect(screen.queryByLabelText('Max attempts')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByLabelText('Slug')).toBeNull())
    expect(api.createSession).not.toHaveBeenCalled()

    const created = { ...session('c5', 'zeta'), preset_id: 'p-default', preset_name: 'Default' }
    api.createSession.mockResolvedValue(created)
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    const slug = (await screen.findByLabelText('Slug')) as HTMLInputElement
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Preset' }).textContent).toBe('Default'))
    fireEvent.change(slug, { target: { value: 'zeta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({ preset_id: 'p-default', project: 'default', slug: 'zeta' }))
    emit('session_status', { session: created })
    await waitFor(() => expect(selectedTab()?.textContent).toContain('zeta'))
    expect(selectedTab()?.textContent).toContain('Default')
    await waitFor(() => expect(screen.queryByLabelText('Slug')).toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Session actions' })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Discard' }))
    expect(await screen.findByLabelText('Type the slug to confirm')).toBeTruthy()
  })

  test('restart_from_top_bar_confirms_and_posts', async () => {
    api.restartSession.mockResolvedValue({ command_ids: [1] })
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('button', { name: 'Session actions' })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restart' }))
    expect(await screen.findByText(/Restart alpha\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(api.restartSession).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(screen.queryByText(/Restart alpha\?/)).toBeNull())
  })

  test('no_edit_entry_point', async () => {
    mount()
    await waitFor(() => expect(tabs()).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('button', { name: 'Session actions' })[0])
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Init scripts', 'Permissions', 'Tasks', 'Restart', 'Discard'])
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
  })
  test('deep link /tasks/T-5 renders the task route', () => {
    mount('/tasks/T-5')
    expect(screen.getByTestId('task-route').getAttribute('data-key')).toBe('T-5')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  test('root path still renders the sessions shell', async () => {
    mount('/')
    await waitFor(() => expect(tabs()).toHaveLength(2))
    expect(screen.queryByTestId('task-route')).toBeNull()
  })

  test('/?session=<id> selects that session', async () => {
    mount('/?session=c2')
    await waitFor(() => expect(tabs()).toHaveLength(2))
    await waitFor(() => expect(selectedTab()?.textContent).toContain('beta'))
  })

  test('unknown /tasks/x/y shows not found', () => {
    mount('/tasks/x/y')
    expect(screen.getByTestId('tasks-not-found')).toBeTruthy()
  })
})

describe('ribbon retirement', () => {
  test('ribbon_files_retired', () => {
    // Filesystem check via Vite's glob (keys only, nothing is imported), independent of git state.
    const onDisk = Object.keys(import.meta.glob(['./ribbon/*', './layout/*']))
    for (const gone of ['./ribbon/Ribbon.tsx', './ribbon/ClusterRow.tsx', './ribbon/Ribbon.test.tsx', './layout/Shell.tsx']) {
      expect(onDisk).not.toContain(gone)
    }
    expect(onDisk).toContain('./ribbon/useSessions.ts')
  })
})
