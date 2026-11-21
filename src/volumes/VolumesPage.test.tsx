// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { setViewport } from '../test/viewport'
import type { VolumeDetail, VolumeView } from './api'
import { VolumesPage } from './VolumesPage'

const api = vi.hoisted(() => ({
  listVolumes: vi.fn(),
  getVolume: vi.fn(),
  createVolume: vi.fn(),
  patchVolume: vi.fn(),
  deleteVolume: vi.fn(),
  volumeEvents: vi.fn(),
  saveVolume: vi.fn(),
  restoreVolume: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('../projects/api', () => ({ listProjects: vi.fn().mockResolvedValue([{ slug: 'alpha' }, { slug: 'beta' }]) }))
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  getMeta: vi.fn().mockResolvedValue({ caps: { volume_storage_class: 'rwx-fast', volume_max_size: '100Gi', volume_default_size: '10Gi', volume_max_per_preset: 4 } }),
}))

const TS = '2026-11-01T10:00:00Z'
const view = (o: Partial<VolumeView> = {}): VolumeView => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'data', projects: ['alpha'], description: 'shared data', labels: [], exclude: [], size: '10Gi',
  storage_class: 'rwx-fast', state: 'ready', state_reason: null, attachments: 2, mounted: 0, current_version: null, content_version: null, last_save_at: TS, created_at: TS, ...o,
})
const detail = (o: Partial<VolumeDetail> = {}): VolumeDetail => ({
  ...view(), presets: [{ preset_id: 'p1', preset_name: 'builder', mode: 'rw', mount_path: '/volumes/data', backup_restore: true }], claims: [],
  versions: [{ id: 'ver-1', created_at: TS, origin: 'save', live: false }], ...o,
} as VolumeDetail)

const mount = () => render(<ThemeProvider theme={theme}><MemoryRouter><VolumesPage onBack={() => {}} /></MemoryRouter></ThemeProvider>)

beforeEach(() => {
  setViewport(1440)
  for (const m of Object.values(api)) m.mockReset()
  api.listVolumes.mockResolvedValue([view(), view({ id: '2', name: 'cache', projects: ['alpha', 'beta'], size: '1Gi', attachments: 0, mounted: 3, last_save_at: null })])
  api.getVolume.mockResolvedValue(detail())
  api.volumeEvents.mockResolvedValue({ items: [{ id: 5, at: TS, actor_kind: 'user', actor: 'me', kind: 'created', detail: {} }], next_cursor: null })
})
afterEach(cleanup)

const openDetails = async (u: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText('cache')
  await u.click(screen.getAllByRole('button', { name: 'Details of data' })[0])
  await screen.findByText('Presets attaching it')
}

describe('VolumesPage', () => {
  test('list renders a row per volume with size, class and counts', async () => {
    mount()
    await screen.findByText('cache')
    const row = screen.getByRole('row', { name: /data/ })
    expect(row.textContent).toContain('10Gi')
    expect(row.textContent).toContain('rwx-fast')
    expect(row.textContent).toContain('alpha')
    expect(screen.getByRole('row', { name: /cache/ }).textContent).toContain('alpha, beta')
  })

  test('create posts the payload and shows volume_exists as a readable error', async () => {
    const u = userEvent.setup()
    api.createVolume.mockRejectedValueOnce(new ApiError(409, 'volume_exists', 'exists'))
    mount()
    await screen.findByText('cache')
    await u.click(screen.getByRole('button', { name: 'New volume' }))
    await u.type(screen.getByLabelText('Name'), 'scratch')
    await u.click(screen.getByLabelText('Projects'))
    await u.click(await screen.findByRole('option', { name: 'alpha' }))
    await u.type(screen.getByLabelText('Size'), '20Gi')
    await u.type(screen.getByLabelText('Backup excludes'), 'node_modules/**')
    expect((screen.getByLabelText('Storage class') as HTMLInputElement).value).toBe('rwx-fast')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(api.createVolume).toHaveBeenCalledWith({ name: 'scratch', projects: ['alpha'], description: '', labels: [], exclude: ['node_modules/**'], size: '20Gi' }),
    )
    expect(await screen.findByText(/already exists/)).toBeTruthy()
  })

  test('delete shows the volume_attached reason', async () => {
    const u = userEvent.setup()
    api.deleteVolume.mockRejectedValueOnce(new ApiError(409, 'volume_attached', 'attached'))
    mount()
    await openDetails(u)
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/Detach it from every preset/)).toBeTruthy()
  })

  test('restore is disabled while the volume is mounted', async () => {
    const u = userEvent.setup()
    api.getVolume.mockResolvedValue(detail({ mounted: 1, claims: [{ session_slug: 's1', mode: 'rw' }] }))
    mount()
    await openDetails(u)
    expect((screen.getByRole('button', { name: 'Restore version ver-1' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Restore is disabled: A session has this volume mounted/)).toBeTruthy()
  })

  test('restore calls the API with the version when unmounted', async () => {
    const u = userEvent.setup()
    api.restoreVolume.mockResolvedValue(view())
    mount()
    await openDetails(u)
    await u.click(screen.getByRole('button', { name: 'Restore version ver-1' }))
    await waitFor(() => expect(api.restoreVolume).toHaveBeenCalledWith(view().id, 'ver-1'))
  })

  test('resize refuses a smaller size client-side', async () => {
    const u = userEvent.setup()
    mount()
    await openDetails(u)
    const size = screen.getByLabelText('Size')
    await u.clear(size)
    await u.type(size, '5Gi')
    expect(screen.getByText(/can only grow/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Resize' }) as HTMLButtonElement).disabled).toBe(true)
    await u.clear(size)
    await u.type(size, '20Gi')
    await u.click(screen.getByRole('button', { name: 'Resize' }))
    await waitFor(() => expect(api.patchVolume).toHaveBeenCalledWith(view().id, { size: '20Gi' }))
  })

  test('the detail links to the volume backups and shows the exclude hint', async () => {
    const u = userEvent.setup()
    api.getVolume.mockResolvedValue(detail({ exclude: ['tmp/**'] }))
    mount()
    await openDetails(u)
    expect(screen.getByRole('link', { name: 'Open in Backups' }).getAttribute('href')).toBe('/?view=backups&name=volume-data')
    expect((screen.getByLabelText('Backup excludes') as HTMLTextAreaElement).value).toBe('tmp/**')
    expect(screen.getByText(/mounted volume is not affected/)).toBeTruthy()
  })
})
