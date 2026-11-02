// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RecordView } from './api'
import { useHistoryChat } from './useHistoryChat'

const api = vi.hoisted(() => ({ listRecords: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const eventRecord = (recordId: number, eventId: number, text: string, agent = 'a0'): RecordView => ({
  id: recordId,
  kind: 'event',
  ts: '2026-10-25T10:00:00Z',
  truncated: false,
  body: { kind: 'event', id: eventId, agent_id: agent, ts: '2026-10-25T10:00:00Z', type: 'assistant_text', turn_id: 't1', data: { text } },
})
const page = (records: RecordView[], hasMoreBefore = false) => ({ records, has_more_before: hasMoreBefore, next_after_id: null })

beforeEach(() => { api.listRecords.mockReset(); api.listRecords.mockResolvedValue({ records: [], has_more_before: false, next_after_id: null }) })
afterEach(cleanup)

describe('useHistoryChat', () => {
  test('maps stored event records to chat items with the agent ordinal', async () => {
    api.listRecords.mockResolvedValue(page([eventRecord(10, 1, 'hello'), eventRecord(11, 2, 'world', 'a1')]))
    const { result } = renderHook(() => useHistoryChat('sess-1', { a0: 0, a1: 1 }))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.listRecords).toHaveBeenCalledWith('sess-1', { kind: 'event', limit: 200 })
    expect(result.current.items.map((i) => [i.kind, 'text' in i ? i.text : '', i.agentOrdinal])).toEqual([
      ['assistant', 'hello', 0],
      ['assistant', 'world', 1],
    ])
    expect(result.current.hasMoreBefore).toBe(false)
  })

  test('pages older events by the oldest record id, not the event id', async () => {
    api.listRecords
      .mockResolvedValueOnce(page([eventRecord(500, 7, 'new')], true))
      .mockResolvedValueOnce(page([eventRecord(300, 3, 'old')], false))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.hasMoreBefore).toBe(true))
    act(() => result.current.loadOlder())
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(api.listRecords).toHaveBeenLastCalledWith('sess-1', { kind: 'event', before_id: 500, limit: 200 })
    expect(result.current.items.map((i) => i.eventId)).toEqual([3, 7])
    expect(result.current.hasMoreBefore).toBe(false)
    expect(result.current.loadingOlder).toBe(false)
  })

  test('loadOlder does nothing when there is no older page', async () => {
    api.listRecords.mockResolvedValue(page([eventRecord(5, 1, 'only')]))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.loadOlder())
    expect(api.listRecords).toHaveBeenCalledTimes(1)
  })

  test('an empty older page ends paging', async () => {
    api.listRecords.mockResolvedValueOnce(page([eventRecord(5, 1, 'x')], true)).mockResolvedValueOnce(page([], true))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.hasMoreBefore).toBe(true))
    act(() => result.current.loadOlder())
    await waitFor(() => expect(result.current.hasMoreBefore).toBe(false))
  })

  test('skips records whose body is not an event row', async () => {
    const bad: RecordView = { ...eventRecord(9, 1, 'x'), body: 'oops' }
    api.listRecords.mockResolvedValue(page([bad, eventRecord(10, 2, 'fine')]))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })

  test('reports a load error', async () => {
    api.listRecords.mockImplementation(() => Promise.reject(new Error('boom')))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.error).toBe('boom'))
    expect(result.current.loading).toBe(false)
  })

  test('never opens an EventSource and never calls the orchestrator API', async () => {
    const source = vi.fn()
    const fetchSpy = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('EventSource', source)
    vi.stubGlobal('fetch', fetchSpy)
    api.listRecords.mockResolvedValue(page([eventRecord(5, 1, 'x')]))
    const { result } = renderHook(() => useHistoryChat('sess-1', {}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.unstubAllGlobals()
    expect(source).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('switching session drops the old items', async () => {
    api.listRecords.mockResolvedValueOnce(page([eventRecord(5, 1, 'first')])).mockResolvedValueOnce(page([eventRecord(8, 1, 'second')]))
    const { result, rerender } = renderHook(({ id }) => useHistoryChat(id, {}), { initialProps: { id: 'a' } })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.items.map((i) => ('text' in i ? i.text : ''))).toEqual(['second']))
  })
})
