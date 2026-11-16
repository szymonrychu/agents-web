import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { answerApprovals, expiresIn, listApprovals } from './api'

const fetchMock = vi.fn()
beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{"items":[]}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await loadConfig(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'taskboard', label: 'T', basePath: '/tb/api/v1' }] })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

const last = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url, method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(init.body as string) }
}

test('expiresIn formats days, hours and minutes', () => {
  const now = new Date('2026-11-15T00:00:00Z')
  expect(expiresIn('2026-11-17T05:00:00Z', now)).toBe('Expires in 2 d 5 h')
  expect(expiresIn('2026-11-15T03:10:00Z', now)).toBe('Expires in 3 h 10 min')
  expect(expiresIn('2026-11-15T00:04:00Z', now)).toBe('Expires in 4 min')
  expect(expiresIn('2026-11-14T23:59:00Z', now)).toBe('Expired')
})

test('answerApprovals posts the items', async () => {
  await answerApprovals([{ id: 1, verdict: 'go' }])
  expect(last()).toEqual({ url: '/tb/api/v1/approvals/answer', method: 'POST', body: { items: [{ id: 1, verdict: 'go' }] } })
})

test('listApprovals builds the query', async () => {
  await listApprovals({ status: 'open', session: 's1' })
  expect(last().url).toBe('/tb/api/v1/approvals?status=open&session=s1')
  expect(last().method).toBe('GET')
  await listApprovals()
  expect(last().url).toBe('/tb/api/v1/approvals')
})
