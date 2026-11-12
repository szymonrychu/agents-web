// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SessionView } from '../api/client'
import type { StreamOptions } from '../api/stream'
import { loadConfig, resetConfig } from '../config/backends'
import type { SessionEntry } from '../ribbon/useSessions'
import { decision, task } from '../tasks/testUtils'
import { useAttention } from './useAttention'

const tasks = vi.hoisted(() => ({ listTasks: vi.fn() }))
// taskStreamUrl stays real: it throws while the taskboard backend is not configured, so no stream opens.
vi.mock('../tasks/api', async (orig) => ({ ...(await orig<typeof import('../tasks/api')>()), ...tasks }))
const stream = vi.hoisted(() => ({ opts: null as null | StreamOptions, opened: 0 }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: StreamOptions) => {
    stream.opts = opts
    stream.opened++
    return { close: () => {} }
  },
}))

const entry = (id: string, summary: Record<string, unknown> = {}): SessionEntry => ({
  session: { id, slug: id, desired: 'active', status: {}, spec: {}, summary: { state: 'waiting', ready: 1, replicas: 1, ...summary } } as unknown as SessionView,
  agents: {},
})
const ENTRIES = [entry('a'), entry('b', { attention_agents: 1 }), entry('c')]

const withTaskboard = () =>
  loadConfig(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'taskboard', label: 'T', basePath: '/tb/api/v1' }] })))

beforeEach(() => {
  tasks.listTasks.mockReset()
  stream.opts = null
  stream.opened = 0
})
afterEach(() => resetConfig())

describe('useAttention', () => {
  test('quiet when the taskboard is not configured', async () => {
    const { result } = renderHook(() => useAttention(ENTRIES))
    await act(async () => {})
    expect(tasks.listTasks).not.toHaveBeenCalled()
    expect(stream.opened).toBe(0)
    expect([...result.current.ids]).toEqual(['b'])
    expect(result.current.bySession.get('b')).toEqual({ decisions: 0, tasks: [], prompt: true })
  })

  test('fetches waiting tasks and groups them', async () => {
    await withTaskboard()
    const t = task({ decisions: [decision({ asking_session: 'a' })] })
    tasks.listTasks.mockResolvedValue({ items: [t], next_cursor: null })
    const { result } = renderHook(() => useAttention(ENTRIES))
    await waitFor(() => expect(result.current.ids.has('a')).toBe(true))
    expect(tasks.listTasks).toHaveBeenCalledWith({ status: 'active', waiting: true, limit: 200 })
    expect(result.current.bySession.get('a')).toEqual({ decisions: 1, tasks: [t], prompt: false })
    expect([...result.current.ids].sort()).toEqual(['a', 'b'])
  })

  test('refreshes on task_changed', async () => {
    await withTaskboard()
    tasks.listTasks.mockResolvedValue({ items: [task({ decisions: [decision({ asking_session: 'a' })] })], next_cursor: null })
    const { result } = renderHook(() => useAttention(ENTRIES))
    await waitFor(() => expect(result.current.ids.has('a')).toBe(true))
    tasks.listTasks.mockResolvedValue({ items: [], next_cursor: null })
    const calls = tasks.listTasks.mock.calls.length
    act(() => stream.opts!.onEvent({ key: 'T-1' }, { type: 'task_changed', id: '1' }))
    await waitFor(() => expect(result.current.ids.has('a')).toBe(false))
    expect(tasks.listTasks.mock.calls.length).toBeGreaterThan(calls)
  })

  test('keeps the last data when a poll fails', async () => {
    await withTaskboard()
    tasks.listTasks.mockResolvedValue({ items: [task({ decisions: [decision({ asking_session: 'a' })] })], next_cursor: null })
    const { result } = renderHook(() => useAttention(ENTRIES))
    await waitFor(() => expect(result.current.ids.has('a')).toBe(true))
    tasks.listTasks.mockRejectedValue(new Error('down'))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.ids.has('a')).toBe(true)
  })

  test('ids keep their identity when the content is unchanged', async () => {
    await withTaskboard()
    tasks.listTasks.mockImplementation(async () => ({ items: [task({ decisions: [decision({ asking_session: 'a' })] })], next_cursor: null }))
    const { result } = renderHook(() => useAttention(ENTRIES))
    await waitFor(() => expect(result.current.ids.has('a')).toBe(true))
    const before = result.current.ids
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.ids).toBe(before)
  })
})
