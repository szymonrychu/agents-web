// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProposalView } from './api'
import { useActiveProposals } from './useActiveProposals'

const api = vi.hoisted(() => ({ listProposals: vi.fn() }))
vi.mock('./api', () => api)

const prop = (id: number, status: ProposalView['status'], revision = 1) => ({ id, status, revision }) as ProposalView

beforeEach(() => {
  localStorage.clear()
  api.listProposals.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useActiveProposals', () => {
  test('polls the active list and counts open and stale', async () => {
    api.listProposals.mockResolvedValue([prop(1, 'open'), prop(2, 'stale'), prop(3, 'rework')])
    const { result } = renderHook(() => useActiveProposals())
    await waitFor(() => expect(result.current.proposals).toHaveLength(3))
    expect(api.listProposals).toHaveBeenCalledWith('active')
    expect(result.current.count).toBe(2)
  })

  test('polls every 20 seconds', async () => {
    vi.useFakeTimers()
    api.listProposals.mockResolvedValue([])
    renderHook(() => useActiveProposals())
    await act(async () => {})
    expect(api.listProposals).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(api.listProposals).toHaveBeenCalledTimes(2)
  })

  test('auto-opens a new open revision once, not on a repeat', async () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    api.listProposals.mockResolvedValue([prop(1, 'open'), prop(2, 'stale')])
    renderHook(() => useActiveProposals(onOpen))
    await act(async () => {})
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0].id).toBe(1)
    api.listProposals.mockResolvedValue([prop(1, 'open'), prop(2, 'stale')])
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(onOpen).toHaveBeenCalledTimes(1)
    api.listProposals.mockResolvedValue([prop(1, 'open', 2)])
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onOpen.mock.calls[1][0].revision).toBe(2)
  })

  test('seen keys survive a remount through localStorage', async () => {
    const onOpen = vi.fn()
    api.listProposals.mockResolvedValue([prop(1, 'open')])
    const first = renderHook(() => useActiveProposals(onOpen))
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    first.unmount()
    renderHook(() => useActiveProposals(onOpen))
    await waitFor(() => expect(api.listProposals).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  test('a throwing localStorage still renders and opens once per page load', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    vi.useFakeTimers()
    const onOpen = vi.fn()
    api.listProposals.mockResolvedValue([prop(1, 'open')])
    const { result } = renderHook(() => useActiveProposals(onOpen))
    await act(async () => {})
    expect(result.current.count).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
