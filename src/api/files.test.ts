import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { ApiError } from './client'
import { fileDownloadUrl, writeFile } from './files'

afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

describe('fileDownloadUrl', () => {
  it('is the relative download route under the runtime basePath, with the path query-encoded', async () => {
    const cfg = { backends: [{ id: 'orchestrator', label: 'O', basePath: '/orch/api/v1' }] }
    await loadConfig((async () => new Response(JSON.stringify(cfg))) as unknown as typeof fetch)
    expect(fileDownloadUrl('c1', 'src/a b.txt')).toBe('/orch/api/v1/sessions/c1/files/download?path=src%2Fa+b.txt')
  })

  it('encodes the session id as a path segment', async () => {
    const cfg = { backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }] }
    await loadConfig((async () => new Response(JSON.stringify(cfg))) as unknown as typeof fetch)
    expect(fileDownloadUrl('a/b', 'x')).toBe('/api/v1/sessions/a%2Fb/files/download?path=x')
  })
})

const useBase = async (basePath: string) => {
  const cfg = { backends: [{ id: 'orchestrator', label: 'O', basePath }] }
  await loadConfig((async () => new Response(JSON.stringify(cfg))) as unknown as typeof fetch)
}

describe('writeFile', () => {
  it('writeFile sends a JSON PUT to the relative content route and resolves to the parsed answer', async () => {
    await useBase('/orch/api/v1')
    const written = { session_id: 's', agent_id: 'a', path: 'src/a b.txt', size: 2, mtime: '2026-10-27T10:00:01.000Z' }
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(written)))
    vi.stubGlobal('fetch', fetchMock)
    const expected = { mtime: '2026-10-27T10:00:00.000Z', size: 1 }

    await expect(writeFile('c1', 'src/a b.txt', 'x\n', expected)).resolves.toEqual(written)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/orch/api/v1/sessions/c1/files/content?path=src%2Fa+b.txt')
    expect(init?.method).toBe('PUT')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.body).toBe(JSON.stringify({ content: 'x\n', expected }))
  })

  it('writeFile sends expected null as null for an unconditional overwrite', async () => {
    await useBase('/api/v1')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await writeFile('c1', 'a.txt', '', null)

    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"content":"","expected":null}')
  })

  it('writeFile conflict rejects with an ApiError 409 file_changed', async () => {
    await useBase('/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'file_changed', message: 'the file changed' } }), { status: 409 })),
    )

    const err = await writeFile('c1', 'a.txt', 'x', { mtime: 'm', size: 1 }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'file_changed' })
  })
})
