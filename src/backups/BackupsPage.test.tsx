// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { loadConfig, resetConfig } from '../config/backends'
import { theme } from '../theme'
import type { ArchiveView } from '../api/archives'
import { BackupsPage } from './BackupsPage'

const api = vi.hoisted(() => ({ listArchives: vi.fn(), deleteArchives: vi.fn(), cleanupPreview: vi.fn() }))
vi.mock('../api/archives', async (orig) => ({ ...(await orig<typeof import('../api/archives')>()), ...api }))

const NOW = Date.parse('2026-11-01T12:00:00Z')
const archive = (name: string, o: Partial<ArchiveView> = {}): ArchiveView => ({
  key: `p/${name}.tar.zst`, name, size: 5 * 1024 * 1024, last_modified: '2026-10-30T12:00:00Z', referenced_by: [], protected: false, ...o,
})
const mount = () => render(<ThemeProvider theme={theme}><BackupsPage onBack={() => {}} /></ThemeProvider>)
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(api).forEach((m) => m.mockReset())
  await loadConfig((async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/orch/api/v1' }] }))) as unknown as typeof fetch)
  api.listArchives.mockResolvedValue({ items: [archive('team-a', { referenced_by: ['slug-1', 'slug-2'], protected: true }), archive('team-b')], next_cursor: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetConfig()
})

describe('BackupsPage', () => {
  test('renders name, size, age, referenced-by and the protected badge', async () => {
    mount()
    const a = within(await rowOf('team-a'))
    expect(a.getByText('5.0 MiB')).toBeTruthy()
    expect(a.getByText('2d ago')).toBeTruthy()
    expect(a.getByText('slug-1, slug-2')).toBeTruthy()
    expect(a.getByText('protected')).toBeTruthy()
    expect(within(await rowOf('team-b')).queryByText('protected')).toBeNull()
  })

  test('Download is a plain link to the relative download endpoint', async () => {
    mount()
    const link = within(await rowOf('team-b')).getByRole('link', { name: 'Download team-b' })
    expect(link.getAttribute('href')).toBe('/orch/api/v1/cache/archives/download?key=p%2Fteam-b.tar.zst')
  })

  test('Delete is disabled for a protected archive', async () => {
    mount()
    expect((within(await rowOf('team-a')).getByRole('button', { name: 'Delete team-a' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('Delete asks in an MUI dialog, then calls DELETE and refreshes; Cancel deletes nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    api.deleteArchives.mockResolvedValue({ deleted: ['p/team-b.tar.zst'], refused: [], errors: [] })
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete archive?' })
    expect(within(dialog).getByText(/p\/team-b\.tar\.zst/)).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.deleteArchives).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete archive?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteArchives).toHaveBeenCalledWith(['p/team-b.tar.zst']))
    await waitFor(() => expect(api.listArchives).toHaveBeenCalledTimes(2))
    expect(confirm).not.toHaveBeenCalled()
  })

  test('shows a refusal reported by the server', async () => {
    api.deleteArchives.mockResolvedValue({ deleted: [], refused: [{ key: 'p/team-b.tar.zst', reason: 'referenced by a live session' }], errors: [] })
    mount()
    await userEvent.click(within(await rowOf('team-b')).getByRole('button', { name: 'Delete team-b' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete archive?' })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/p\/team-b\.tar\.zst: referenced by a live session/)).toBeTruthy()
  })

  test('Load more fetches the next page with the cursor', async () => {
    api.listArchives.mockResolvedValueOnce({ items: [archive('one')], next_cursor: 'c1' }).mockResolvedValueOnce({ items: [archive('two')], next_cursor: null })
    mount()
    await screen.findByText('one')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('two')
    expect(api.listArchives).toHaveBeenLastCalledWith({ cursor: 'c1' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a 503 shows the not configured state', async () => {
    api.listArchives.mockRejectedValue(new ApiError(503, 'unavailable', 'the cache archives are not configured for the api'))
    mount()
    expect(await screen.findByText('Archive storage is not configured on this orchestrator')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('says so when there are no archives', async () => {
    api.listArchives.mockResolvedValue({ items: [], next_cursor: null })
    mount()
    expect(await screen.findByText('No archives yet')).toBeTruthy()
  })

  test('Cleanup preview opens the dialog', async () => {
    api.cleanupPreview.mockResolvedValue({ would_delete: [], count: 0, total_bytes: 0, retention_days: 30, keep_newest: 3, grace_seconds: 0, sweep_enabled: false, sweep_dry_run: true, last_sweep: null })
    mount()
    await screen.findByText('team-b')
    await userEvent.click(screen.getByRole('button', { name: 'Cleanup preview' }))
    expect(await screen.findByRole('dialog', { name: 'Cleanup preview' })).toBeTruthy()
  })
})
