import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { listProposals } from './api'

let f: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }] }))))
  f = vi.fn(async () => new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', f)
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

test('lists the active proposals with GET /api/v1/proposals?status=active', async () => {
  await listProposals('active')
  const [url, init] = f.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('/api/v1/proposals?status=active')
  expect(init.method).toBe('GET')
})

test('the filter defaults to active and a limit is appended', async () => {
  await listProposals()
  expect(f.mock.calls[0][0]).toBe('/api/v1/proposals?status=active')
  await listProposals('closed', 5)
  expect(f.mock.calls[1][0]).toBe('/api/v1/proposals?status=closed&limit=5')
})

test('gets one proposal and posts a review with the revision', async () => {
  const { getProposal, reviewProposal } = await import('./api')
  await getProposal(7)
  expect(f.mock.calls.at(-1)?.[0]).toBe('/api/v1/proposals/7')
  await reviewProposal(7, { revision: 2, items: [{ path: 'model', decision: 'approve' }] })
  const [url, init] = f.mock.calls.at(-1) as [string, RequestInit]
  expect(url).toBe('/api/v1/proposals/7/review')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual({ revision: 2, items: [{ path: 'model', decision: 'approve' }] })
})
