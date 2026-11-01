// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView, Meta } from '../api/client'
import { theme } from '../theme'
import { DiscardSessionDialog } from './DiscardSessionDialog'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'

const api = vi.hoisted(() => ({ deleteSession: vi.fn(), getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const meta = (o: Partial<Meta> = {}): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: false, max_bytes: 0 }, kube_access: { available: false }, docker: { available: false, max_cpu: '8', max_memory: '16Gi', max_storage: '100Gi', storage: '30Gi' }, permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }], caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, models: ['opus', 'sonnet', 'haiku'], efforts: ['low', 'medium', 'high', 'max'], ...o,
})
const NO_BACKUP: SessionView['backup'] = { workdir: false, transcripts: false, reason: 'no_session_cache', last_transcripts_backup: null }
const existing = (o: Partial<SessionView['spec']> = {}, backup: Partial<SessionView['backup']> = {}): SessionView =>
  ({ backup: { ...NO_BACKUP, ...backup }, created_at: '2026-01-01T00:00:00Z', desired: 'active', generation: 1, id: 'c-1', observed_generation: 1, slug: 'alpha', status: {},
    spec: { env: { A: 'b' }, max_attempts: 5, peers: true, replicas: 2, workdir: 'work', pvc_size: '20Gi', model: 'opus', ...o },
    summary: { auto_compact_pct: 80, context_pct_max: null, failed: 0, queued: 0, ready: 0, replicas: 2, state: 'waiting' } }) as SessionView

const wrap = (el: React.ReactElement) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.getMeta.mockResolvedValue(meta())
})
afterEach(cleanup)

describe('DiscardSessionDialog', () => {
  test('discard requires typed slug', async () => {
    api.deleteSession.mockResolvedValue(existing())
    const onDiscarded = vi.fn()
    wrap(<DiscardSessionDialog open session={existing()} onClose={vi.fn()} onDiscarded={onDiscarded} />)
    expect(screen.getByText(/The workspace PVC/)).toBeTruthy()
    expect(screen.getByText(/The session's whole chat history/)).toBeTruthy()
    expect(screen.getByText(/no undo/i)).toBeTruthy()
    expect(button('Discard').disabled).toBe(true)
    await userEvent.type(field('Type the slug to confirm'), 'alph')
    expect(button('Discard').disabled).toBe(true)
    await userEvent.type(field('Type the slug to confirm'), 'a')
    expect(button('Discard').disabled).toBe(false)
    await userEvent.click(button('Discard'))
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('c-1'))
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled())
  })

  test('discard names the export hook', async () => {
    api.getMeta.mockResolvedValue(meta({ discard_hook: 'url' }))
    wrap(<DiscardSessionDialog open session={existing({ discard_hook_url: 'https://hook.example/x' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(await screen.findByText(/exported to https:\/\/hook\.example\/x first/)).toBeTruthy()
    expect(screen.getByText(/failing hook holds the discard/)).toBeTruthy()
    cleanup()
    wrap(<DiscardSessionDialog open session={existing()} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(await screen.findByText(/exported to the configured url hook first/)).toBeTruthy()
    cleanup()
    api.getMeta.mockResolvedValue(meta())
    wrap(<DiscardSessionDialog open session={existing()} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    await waitFor(() => expect(api.getMeta).toHaveBeenCalledTimes(3))
    expect(screen.queryByText(/exported to/)).toBeNull()
  })

  test('shows the rendered save target from the status, and the template before it is rendered', () => {
    const backup = { workdir: true, transcripts: false, reason: 'restore_running', last_transcripts_backup: null }
    const cache = { restore_key: 'team/', save_key: 'team/{{ now }}', exclude: [] }
    wrap(<DiscardSessionDialog open session={{ ...existing({ cache }, backup), status: { cache: { save_resolved: 'p/team/20261101T120000Z' } } }} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(within(screen.getByRole('list', { name: 'Backed up' })).getByText(/Workspace files.*saved to the S3 cache as p\/team\/20261101T120000Z/)).toBeTruthy()
    cleanup()
    wrap(<DiscardSessionDialog open session={existing({ cache }, backup)} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(within(screen.getByRole('list', { name: 'Backed up' })).getByText(/Workspace files.*saved to the S3 cache as team\/\{\{ now \}\} \(rendered when it is saved\)/)).toBeTruthy()
  })

  test('a restore-only cache says nothing is saved and lists the workspace files as deleted', () => {
    const backup = { workdir: true, transcripts: false, reason: 'restore_running', last_transcripts_backup: null }
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'team/', save_key: '', exclude: [] } }, backup)} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.queryByText('Restore-only cache: nothing is saved to it')).toBeNull()
    expect(screen.getByText('Nothing is backed up: the cache is restore-only and the Claude transcripts are not backed up (the cache restore has not finished).')).toBeTruthy()
    expect(screen.queryByText(/session has no session cache/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Backed up' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Deleted' })).getByText(/The workspace files/)).toBeTruthy()
    cleanup()
    const noReason = { workdir: true, transcripts: false, reason: null, last_transcripts_backup: null }
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'team/', save_key: '', exclude: [] } }, noReason)} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Nothing is backed up: the cache is restore-only and the Claude transcripts are not backed up.')).toBeTruthy()
  })

  test('a restore-only cache that backs up transcripts says only that no workspace files are saved', () => {
    const backup = { workdir: true, transcripts: true, reason: null, last_transcripts_backup: null }
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'team/', save_key: '', exclude: [] } }, backup)} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Restore-only cache: nothing is saved to it')).toBeTruthy()
    expect(screen.queryByText(/Nothing is backed up/)).toBeNull()
  })

  test('states what is backed up when the session cache is configured', () => {
    const backup = { workdir: true, transcripts: true, reason: null, last_transcripts_backup: { finished_at: '2026-10-27T10:00:00Z', bytes: 2048 } }
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'my-key', save_key: 'my-key', exclude: [] } }, backup)} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    const deleted = within(screen.getByRole('list', { name: 'Deleted' }))
    const saved = within(screen.getByRole('list', { name: 'Backed up' }))
    expect(saved.getByText(/Workspace files.*S3 cache as my-key.*restored when a session with the same slug is created/)).toBeTruthy()
    expect(saved.getByText(/Claude transcripts.*S3 cache.*restored when a session with the same slug is created/)).toBeTruthy()
    expect(screen.getByText(/last transcripts backup finished/i).textContent).toMatch(/2 KB/)
    expect(deleted.getByText(/The agents/)).toBeTruthy()
    expect(deleted.getByText(/The workspace PVC/)).toBeTruthy()
    expect(deleted.getByText(/chat history/)).toBeTruthy()
    expect(deleted.queryByText(/Claude transcripts/)).toBeNull()
    expect(deleted.queryByText(/workspace files/i)).toBeNull()
    expect(screen.queryByText(/Nothing is backed up/)).toBeNull()
  })

  test('states nothing is backed up without a session cache', () => {
    wrap(<DiscardSessionDialog open session={existing()} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Nothing is backed up: the session has no session cache.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Backed up' })).toBeNull()
    const deleted = within(screen.getByRole('list', { name: 'Deleted' }))
    expect(deleted.getByText(/Claude transcripts/)).toBeTruthy()
    expect(deleted.getByText(/workspace files/i)).toBeTruthy()
    cleanup()
    wrap(<DiscardSessionDialog open session={existing({}, { reason: 'cache_not_configured' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Nothing is backed up: no S3 cache is configured on this orchestrator.')).toBeTruthy()
  })

  test('names the reason a backup is skipped', () => {
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'k', save_key: 'k', exclude: [] } }, { reason: 'restore_failed' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Nothing is backed up: the cache restore failed, so the stored copy is not overwritten.')).toBeTruthy()
    cleanup()
    // Only the transcripts are skipped: the workspace stays listed as backed up, the transcripts as deleted.
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'k', save_key: 'k', exclude: [] } }, { workdir: true, reason: 'restore_running' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(within(screen.getByRole('list', { name: 'Backed up' })).getByText(/Workspace files/)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Deleted' })).getByText(/Claude transcripts/)).toBeTruthy()
    expect(screen.getByText('The chat history (Claude transcripts) is not backed up: the cache restore has not finished.')).toBeTruthy()
    cleanup()
    wrap(<DiscardSessionDialog open session={existing({ cache: { restore_key: 'k', save_key: 'k', exclude: [] } }, { reason: 'something_new' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('Nothing is backed up: skipped (something_new).')).toBeTruthy()
  })

  test('names the chat history when transcripts are not backed up', () => {
    const cache = { cache: { restore_key: 'k', save_key: 'k', exclude: [] } }
    wrap(<DiscardSessionDialog open session={existing(cache, { workdir: true, reason: 'restore_skipped' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('The chat history (Claude transcripts) is not backed up: the cache restore was skipped, so the stored copy is not overwritten.')).toBeTruthy()
    expect(screen.queryByText(/workspace is not saved/)).toBeNull()
    cleanup()
    wrap(<DiscardSessionDialog open session={existing(cache, { workdir: true, reason: 'restore_running' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('The chat history (Claude transcripts) is not backed up: the cache restore has not finished.')).toBeTruthy()
  })

  test('names the workspace files when the workdir is not backed up', () => {
    const cache = { cache: { restore_key: 'k', save_key: 'k', exclude: [] } }
    wrap(<DiscardSessionDialog open session={existing(cache, { transcripts: true, reason: 'restore_failed' })} onClose={vi.fn()} onDiscarded={vi.fn()} />)
    expect(screen.getByText('The workspace files are not backed up: the cache restore failed, so the stored copy is not overwritten.')).toBeTruthy()
    expect(screen.queryByText(/chat history \(Claude transcripts\) is not backed up/)).toBeNull()
  })
})
