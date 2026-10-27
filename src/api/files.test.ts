import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { fileDownloadUrl } from './files'

afterEach(resetConfig)

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
