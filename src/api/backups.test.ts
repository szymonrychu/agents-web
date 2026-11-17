import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import {
  cleanupPreview,
  copyBackup,
  deleteName,
  deleteVersion,
  downloadUrl,
  getCleanupSettings,
  getManifest,
  listBackups,
  listVersions,
  putCleanupSettings,
  runCleanupNow,
} from './backups'
import { previewFor } from '../sessions/previewFor'

afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

const useBase = async (basePath: string) => {
  const cfg = { backends: [{ id: 'orchestrator', label: 'O', basePath }] }
  await loadConfig((async () => new Response(JSON.stringify(cfg))) as unknown as typeof fetch)
}

const stub = (body: unknown) => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const settingsView = () => {
  const policy = { enabled: true, dry_run: true, retention_days: 30, keep_newest: 3, interval_seconds: 3600, grace_seconds: 600 }
  return { policy, defaults: policy, source: 'database', updated_at: null, run_requested_at: null, run_pending: false, last_sweep: null }
}

describe('backups client', () => {
  it('lists names with the filter and cursor', async () => {
    await useBase('/orch/api/v1')
    const page = { items: [], next_cursor: null }
    const fetchMock = stub(page)
    await expect(listBackups({ q: 'team a', cursor: 'c1' })).resolves.toEqual(page)
    expect(fetchMock.mock.calls[0][0]).toBe('/orch/api/v1/backups?q=team+a&cursor=c1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('lists without a query when nothing is given', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ items: [], next_cursor: null })
    await listBackups()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/backups')
  })

  it('lists versions of a name, encoding each path segment', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ items: [], next_cursor: null })
    await listVersions('proj/a b', 'c2')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/backups/proj/a%20b/versions?cursor=c2')
  })

  it('reads a manifest', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ name: 'n', version: 'v1', files: null })
    await getManifest('n/x', 'v1')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/backups/n/x/versions/v1/manifest')
  })

  it('builds the relative download URL per segment', async () => {
    await useBase('/orch/api/v1')
    expect(downloadUrl('p/team a', 'v1')).toBe('/orch/api/v1/backups/p/team%20a/versions/v1/download')
  })

  it('copies with source, version and target', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ id: 'v2' })
    await copyBackup({ source: 'a', sourceVersion: 'v1', target: 'b' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/backups/copy')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ source: 'a', source_version: 'v1', target: 'b' })
  })

  it('copies the current version when no version is given', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ id: 'v2' })
    await copyBackup({ source: 'a', target: 'b' })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ source: 'a', target: 'b' })
  })

  it('deletes a version and a whole name', async () => {
    await useBase('/api/v1')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await deleteVersion('a/b', 'v1')
    await deleteName('a/b')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/backups/a/b/versions/v1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/backups/a/b')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('reads the cleanup dry-run preview', async () => {
    await useBase('/api/v1')
    const preview = { would_delete: [], count: 0, total_bytes: 0 }
    const fetchMock = stub(preview)
    await expect(cleanupPreview()).resolves.toEqual(preview)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/backups/cleanup/preview')
  })

  it('reads the cleanup settings', async () => {
    await useBase('/orch/api/v1')
    const view = settingsView()
    const fetchMock = stub(view)
    await expect(getCleanupSettings()).resolves.toEqual(view)
    expect(fetchMock.mock.calls[0][0]).toBe('/orch/api/v1/backups/cleanup/settings')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('saves the cleanup settings', async () => {
    await useBase('/orch/api/v1')
    const policy = { enabled: true, dry_run: false, retention_days: 30, keep_newest: 3, interval_seconds: 3600, grace_seconds: 600 }
    const view = settingsView()
    const fetchMock = stub(view)
    await expect(putCleanupSettings(policy)).resolves.toEqual(view)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/orch/api/v1/backups/cleanup/settings')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual(policy)
  })

  it('requests a sweep now', async () => {
    await useBase('/orch/api/v1')
    const view = { ...settingsView(), run_pending: true }
    const fetchMock = stub(view)
    await expect(runCleanupNow()).resolves.toEqual(view)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/orch/api/v1/backups/cleanup/run')
    expect(init?.method).toBe('POST')
  })
})

describe('previewFor', () => {
  it('posts the archive_name surface', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ rendered: 'x', error: null, variables: [] })
    await previewFor('archive_name')('x')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ template: 'x', surface: 'archive_name' })
  })
})
