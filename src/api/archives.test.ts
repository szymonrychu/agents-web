import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { archiveDownloadUrl, cleanupPreview, deleteArchives, listArchives } from './archives'
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

describe('archives client', () => {
  it('lists archives under a prefix with the cursor and limit', async () => {
    await useBase('/orch/api/v1')
    const page = { items: [], next_cursor: null }
    const fetchMock = stub(page)
    await expect(listArchives({ prefix: 'team/', cursor: 'c1', limit: 50 })).resolves.toEqual(page)
    expect(fetchMock.mock.calls[0][0]).toBe('/orch/api/v1/cache/archives?prefix=team%2F&cursor=c1&limit=50')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('lists without a query when nothing is given', async () => {
    await useBase('/api/v1')
    const fetchMock = stub({ items: [], next_cursor: null })
    await listArchives()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cache/archives')
  })

  it('reads the cleanup dry-run preview', async () => {
    await useBase('/api/v1')
    const preview = { would_delete: [], count: 0, total_bytes: 0 }
    const fetchMock = stub(preview)
    await expect(cleanupPreview()).resolves.toEqual(preview)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cache/cleanup/preview')
  })

  it('deletes keys with a JSON DELETE body', async () => {
    await useBase('/api/v1')
    const result = { deleted: ['a'], refused: [], errors: [] }
    const fetchMock = stub(result)
    await expect(deleteArchives(['a'])).resolves.toEqual(result)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/cache/archives')
    expect(init?.method).toBe('DELETE')
    expect(JSON.parse(init?.body as string)).toEqual({ keys: ['a'] })
  })

  it('builds the relative download URL with the key query-encoded', async () => {
    await useBase('/orch/api/v1')
    expect(archiveDownloadUrl('p/team a/x.tar.zst')).toBe('/orch/api/v1/cache/archives/download?key=p%2Fteam+a%2Fx.tar.zst')
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
