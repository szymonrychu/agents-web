import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { acceptSuggestion, createComment, deleteSpec, dismissSuggestion, getDoc, getSpec, listComments, listDocs, listSpecs, listVersions, patchSpec, resolveComment, specStreamUrl } from './api'
import { docPath, specPath } from './paths'

const fetchMock = vi.fn()
beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await loadConfig(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'taskboard', label: 'T', basePath: '/tb/api/v1' }] })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

const last = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url, method: init?.method ?? 'GET', body: init?.body === undefined ? undefined : JSON.parse(init.body as string) }
}

describe('specs client', () => {
  test('listSpecs sends filters and repeated labels over the configured base path', async () => {
    await listSpecs({ project: 'infra', status: 'review', labels: ['a', 'b'], name: 'plan', cursor: 'c', limit: 20 })
    expect(last().url).toBe('/tb/api/v1/specs?project=infra&status=review&label=a&label=b&name=plan&cursor=c&limit=20')
    await listSpecs()
    expect(last().url).toBe('/tb/api/v1/specs')
  })

  test('spec calls', async () => {
    await getSpec('S-1')
    expect(last()).toMatchObject({ url: '/tb/api/v1/specs/S-1', method: 'GET' })
    await patchSpec('S-1', { version: 2, status: 'approved' })
    expect(last()).toMatchObject({ url: '/tb/api/v1/specs/S-1', method: 'PATCH', body: { version: 2, status: 'approved' } })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteSpec('S-1')
    expect(last()).toMatchObject({ url: '/tb/api/v1/specs/S-1', method: 'DELETE' })
    await listDocs('S-1')
    expect(last().url).toBe('/tb/api/v1/specs/S-1/docs')
  })

  test('document paths keep their slashes and encode each segment', async () => {
    await getDoc('S-1', 'research/my topic.md', 3)
    expect(last().url).toBe('/tb/api/v1/specs/S-1/docs/research/my%20topic.md?version=3')
    await getDoc('S-1', 'plan.md')
    expect(last().url).toBe('/tb/api/v1/specs/S-1/docs/plan.md')
    await listVersions('S-1', 'research/a.md', { limit: 5, cursor: 4 })
    expect(last().url).toBe('/tb/api/v1/specs/S-1/docs/research/a.md/versions?limit=5&cursor=4')
  })

  test('comment calls', async () => {
    await listComments('S-1', { path: 'plan.md', open: true })
    expect(last().url).toBe('/tb/api/v1/specs/S-1/comments?path=plan.md&open=true')
    await createComment('S-1', { body: 'hi', path: 'plan.md', version: 2, anchor: 'intro' })
    expect(last()).toMatchObject({ method: 'POST', url: '/tb/api/v1/specs/S-1/comments', body: { body: 'hi', path: 'plan.md', version: 2, anchor: 'intro' } })
    await resolveComment('S-1', 7)
    expect(last()).toMatchObject({ method: 'POST', url: '/tb/api/v1/specs/S-1/comments/7/resolve' })
    await acceptSuggestion('S-1', 7, 3)
    expect(last()).toMatchObject({ method: 'POST', url: '/tb/api/v1/specs/S-1/comments/7/accept', body: { version: 3 } })
    await dismissSuggestion('S-1', 7)
    expect(last()).toMatchObject({ method: 'POST', url: '/tb/api/v1/specs/S-1/comments/7/dismiss' })
  })

  test('stream url and deep links', () => {
    expect(specStreamUrl()).toBe('/tb/api/v1/stream')
    expect(specPath('S-4')).toBe('/specs/S-4')
    expect(docPath('S-4', 'research/a b.md', { v: 2, diff: 1 })).toBe('/specs/S-4/doc/research/a%20b.md?v=2&diff=1')
    expect(docPath('S-4', 'plan.md')).toBe('/specs/S-4/doc/plan.md')
  })
})
