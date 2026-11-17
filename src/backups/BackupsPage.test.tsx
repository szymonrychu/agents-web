// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { setViewport } from '../test/viewport'
import { ApiError } from '../api/client'
import { loadConfig, resetConfig } from '../config/backends'
import { theme } from '../theme'
import type { BackupNameView, BackupVersionView } from '../api/backups'
import { BackupsPage } from './BackupsPage'

const api = vi.hoisted(() => ({
  listBackups: vi.fn(),
  listVersions: vi.fn(),
  copyBackup: vi.fn(),
  deleteVersion: vi.fn(),
  deleteName: vi.fn(),
  cleanupPreview: vi.fn(),
  getCleanupSettings: vi.fn(),
}))
vi.mock('../api/backups', async (orig) => ({ ...(await orig<typeof import('../api/backups')>()), ...api }))

const NOW = Date.parse('2026-11-01T12:00:00Z')
const POLICY = { enabled: true, dry_run: true, retention_days: 30, keep_newest: 3, interval_seconds: 21600, grace_seconds: 2400 }
const SETTINGS = { policy: POLICY, defaults: POLICY, source: 'environment' as const, updated_at: null, run_requested_at: null, run_pending: false, last_sweep: null }
const named = (name: string, o: Partial<BackupNameView> = {}): BackupNameView => ({
  name,
  current: { id: `${name}-v2`, origin: 'discard', saved_at: '2026-10-30T12:00:00Z', session_slug: `${name}-slug`, size: 5 * 1024 * 1024 },
  version_count: 2,
  referenced_by: [],
  protected: false,
  ...o,
})
const version = (name: string, id: string, o: Partial<BackupVersionView> = {}): BackupVersionView => ({
  id, name, size: 1024, digest: 'd', saved_at: '2026-10-29T12:00:00Z', origin: 'discard', state: o.current ? 'current' : 'superseded', current: false,
  session_slug: 'old-slug', created_by: 'x', referenced_by: [], protected: false, ...o,
})
const mount = (entry = '/') =>
  render(<MemoryRouter initialEntries={[entry]}><ThemeProvider theme={theme}><BackupsPage onBack={() => {}} /></ThemeProvider></MemoryRouter>)
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

beforeEach(async () => {
  setViewport(1440)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(api).forEach((m) => m.mockReset())
  await loadConfig((async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/orch/api/v1' }] }))) as unknown as typeof fetch)
  api.getCleanupSettings.mockResolvedValue(SETTINGS)
  api.listBackups.mockResolvedValue({ items: [named('team-a', { referenced_by: ['slug-1', 'slug-2'], protected: true }), named('team-b')], next_cursor: null })
  api.listVersions.mockResolvedValue({
    items: [version('team-b', 'team-b-v2', { current: true, session_slug: 'team-b-slug', size: 5 * 1024 * 1024 }), version('team-b', 'team-b-v1', { state: 'superseded' })],
    next_cursor: null,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetConfig()
})

describe('BackupsPage', () => {
  test('renders one row per name with slug', async () => {
    mount()
    const a = within(await rowOf('team-a'))
    expect(screen.getAllByRole('row')).toHaveLength(3)
    for (const h of ['Name', 'Size', 'Age', 'Saved by', 'Versions', 'Referenced by']) expect(screen.getByRole('columnheader', { name: h })).toBeTruthy()
    expect(a.getByText('5.0 MiB')).toBeTruthy()
    expect(a.getByText('2d ago')).toBeTruthy()
    expect(a.getByText('team-a-slug')).toBeTruthy()
    expect(a.getByText('2')).toBeTruthy()
    expect(a.getByText('slug-1, slug-2')).toBeTruthy()
    expect(a.getByText('protected')).toBeTruthy()
    expect(within(await rowOf('team-b')).queryByText('protected')).toBeNull()
  })

  test('expands versions', async () => {
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    expect(api.listVersions).toHaveBeenCalledWith('team-b', undefined)
    const table = await screen.findByRole('table', { name: 'Versions of team-b' })
    for (const h of ['Saved', 'Size', 'Saved by', 'Origin', 'State']) expect(within(table).getByRole('columnheader', { name: h })).toBeTruthy()
    const old = within(within(table).getByText('superseded').closest('tr') as HTMLElement)
    expect(old.getByText('old-slug')).toBeTruthy()
    expect(old.getByText('discard')).toBeTruthy()
    expect(old.getByRole('link', { name: 'Download version team-b-v1' }).getAttribute('href')).toBe('/orch/api/v1/backups/team-b/versions/team-b-v1/download')
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Versions of team-b' })).toBeNull())
  })

  test('copy dialog posts source, version and target', async () => {
    api.copyBackup.mockResolvedValue(version('other', 'new'))
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    const table = await screen.findByRole('table', { name: 'Versions of team-b' })
    await userEvent.click(within(within(table).getByText('superseded').closest('tr') as HTMLElement).getByRole('button', { name: 'Copy version team-b-v1 to' }))
    const dialog = await screen.findByRole('dialog', { name: 'Copy backup' })
    await userEvent.type(within(dialog).getByLabelText('Target name'), 'other')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(api.copyBackup).toHaveBeenCalledWith({ source: 'team-b', sourceVersion: 'team-b-v1', target: 'other' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copy backup' })).toBeNull())
  })

  test('a name row offers Copy to for its current version', async () => {
    api.copyBackup.mockResolvedValue(version('other', 'new'))
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Copy team-b to' }))
    const dialog = await screen.findByRole('dialog', { name: 'Copy backup' })
    await userEvent.type(within(dialog).getByLabelText('Target name'), 'other')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(api.copyBackup).toHaveBeenCalledWith({ source: 'team-b', sourceVersion: undefined, target: 'other' }))
  })

  test('copy back to same name', async () => {
    api.copyBackup.mockResolvedValue(version('team-b', 'team-b-v3', { current: true }))
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    const table = await screen.findByRole('table', { name: 'Versions of team-b' })
    const old = within(within(table).getByText('superseded').closest('tr') as HTMLElement)
    expect(within(within(table).getByText('current').closest('tr') as HTMLElement).queryByRole('button', { name: /Make current/ })).toBeNull()
    await userEvent.click(old.getByRole('button', { name: 'Make version team-b-v1 current' }))
    await waitFor(() => expect(api.copyBackup).toHaveBeenCalledWith({ source: 'team-b', sourceVersion: 'team-b-v1', target: 'team-b' }))
    await waitFor(() => expect(api.listBackups).toHaveBeenCalledTimes(2))
  })

  test('filter from ?name=', async () => {
    mount('/?name=team-b')
    await screen.findByText('team-a')
    expect(api.listBackups).toHaveBeenCalledWith({ q: 'team-b' })
    expect((screen.getByLabelText('Filter by name') as HTMLInputElement).value).toBe('team-b')
  })

  test('typing a filter lists again with q', async () => {
    mount()
    await screen.findByText('team-a')
    await userEvent.type(screen.getByLabelText('Filter by name'), 'zz')
    await waitFor(() => expect(api.listBackups).toHaveBeenLastCalledWith({ q: 'zz' }))
  })

  test('delete current version disabled while others exist', async () => {
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    const table = await screen.findByRole('table', { name: 'Versions of team-b' })
    const cur = within(within(table).getByText('current').closest('tr') as HTMLElement)
    expect((cur.getByRole('button', { name: 'Delete version team-b-v2' }) as HTMLButtonElement).disabled).toBe(true)
    const old = within(within(table).getByText('superseded').closest('tr') as HTMLElement)
    expect((old.getByRole('button', { name: 'Delete version team-b-v1' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('the only version of a name can be deleted', async () => {
    api.listBackups.mockResolvedValue({ items: [named('solo', { version_count: 1 })], next_cursor: null })
    api.listVersions.mockResolvedValue({ items: [version('solo', 'solo-v2', { current: true })], next_cursor: null })
    mount()
    await userEvent.click(within(await rowOf('solo')).getByRole('button', { name: 'Versions solo' }))
    const table = await screen.findByRole('table', { name: 'Versions of solo' })
    expect((within(table).getByRole('button', { name: 'Delete version solo-v2' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('deleting a version asks, calls DELETE and refreshes', async () => {
    api.deleteVersion.mockResolvedValue(undefined)
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Versions team-b' }))
    const table = await screen.findByRole('table', { name: 'Versions of team-b' })
    await userEvent.click(within(table).getByRole('button', { name: 'Delete version team-b-v1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete version?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.deleteVersion).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(table).getByRole('button', { name: 'Delete version team-b-v1' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete version?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteVersion).toHaveBeenCalledWith('team-b', 'team-b-v1'))
    await waitFor(() => expect(api.listBackups).toHaveBeenCalledTimes(2))
  })

  test('Delete name is disabled for a protected name', async () => {
    mount()
    expect((within(await rowOf('team-a')).getByRole('button', { name: 'Delete team-a' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('Delete name asks in an MUI dialog, then calls DELETE and refreshes; Cancel deletes nothing', async () => {
    api.deleteName.mockResolvedValue(undefined)
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete backup?' })
    expect(within(dialog).getByText(/team-b and all its versions/)).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.deleteName).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete backup?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteName).toHaveBeenCalledWith('team-b'))
    await waitFor(() => expect(api.listBackups).toHaveBeenCalledTimes(2))
  })

  test('shows a refusal reported by the server', async () => {
    api.deleteName.mockRejectedValue(new ApiError(409, 'backup_referenced', 'referenced by a live session'))
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete backup?' })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/referenced by a live session/)).toBeTruthy()
  })

  test('Load more fetches the next page with the cursor', async () => {
    api.listBackups.mockResolvedValueOnce({ items: [named('one')], next_cursor: 'c1' }).mockResolvedValueOnce({ items: [named('two')], next_cursor: null })
    mount()
    await screen.findByText('one')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('two')
    expect(api.listBackups).toHaveBeenLastCalledWith({ q: undefined, cursor: 'c1' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a 503 shows the not configured state', async () => {
    api.listBackups.mockRejectedValue(new ApiError(503, 'unavailable', 'the backups are not configured for the api'))
    mount()
    expect(await screen.findByText('Backup storage is not configured on this orchestrator')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('says so when there are no backups', async () => {
    api.listBackups.mockResolvedValue({ items: [], next_cursor: null })
    mount()
    expect(await screen.findByText('No backups yet')).toBeTruthy()
  })

  test('Cleanup preview opens the dialog', async () => {
    api.cleanupPreview.mockResolvedValue({ would_delete: [], count: 0, total_bytes: 0, retention_days: 30, keep_newest: 3, grace_seconds: 0, sweep_enabled: false, sweep_dry_run: true, last_sweep: null })
    mount()
    await screen.findByText('team-b')
    await userEvent.click(screen.getByRole('button', { name: 'Cleanup preview' }))
    expect(await screen.findByRole('dialog', { name: 'Cleanup preview' })).toBeTruthy()
  })

  test('shows the cleanup settings only when storage is configured', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Cleanup settings' })).toBeTruthy()
    cleanup()
    api.listBackups.mockRejectedValue(new ApiError(503, 'unavailable', 'the backups are not configured for the api'))
    mount()
    expect(await screen.findByText('Backup storage is not configured on this orchestrator')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Cleanup settings' })).toBeNull()
  })
})

describe('BackupsPage on phones', () => {
  test('one card per name with size, age, slug, versions, references and one actions menu', async () => {
    setViewport(375, { coarse: true })
    mount()
    const card = await screen.findByRole('article', { name: 'Backup team-a' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    const c = within(card)
    expect(c.getByText('team-a')).toBeTruthy()
    expect(c.getByText('protected')).toBeTruthy()
    for (const label of ['Size', 'Age', 'Saved by', 'Versions', 'Referenced by']) expect(c.getByText(label, { selector: 'dt' })).toBeTruthy()
    expect(c.getByText('5.0 MiB')).toBeTruthy()
    expect(c.getByText('team-a-slug')).toBeTruthy()
    expect(c.getByRole('button', { name: 'Actions for Backup team-a' })).toBeTruthy()
    const bare = within(screen.getByRole('article', { name: 'Backup team-b' }))
    expect(bare.getByText('Referenced by', { selector: 'dt' }).nextElementSibling!.textContent).toBe('-')
  })

  test('a wide screen keeps the table with a Name column that does not split words', async () => {
    mount()
    const row = await rowOf('team-a')
    expect(screen.getByRole('table', { name: 'Backups' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Delete team-a' })).toBeTruthy()
    expect(emittedCssFor(row.querySelector('td')!)).toMatch(/word-break:\s*normal/)
  })
})
