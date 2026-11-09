// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { EntryView } from './api'
import { useVaultEntries } from './useVaultEntries'

const api = vi.hoisted(() => ({ listEntries: vi.fn(), vaultEnabled: vi.fn() }))
vi.mock('./api', () => api)

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  api.listEntries.mockReset()
  api.vaultEnabled.mockReset()
})

describe('useVaultEntries', () => {
  test('is off without a request when the vault is not configured', () => {
    api.vaultEnabled.mockReturnValue(false)
    const { result } = renderHook(() => useVaultEntries())
    expect(result.current.status).toBe('off')
    expect(result.current.entries).toEqual([])
    expect(api.listEntries).not.toHaveBeenCalled()
  })

  test('is ready with the entries indexed by id', async () => {
    api.vaultEnabled.mockReturnValue(true)
    api.listEntries.mockResolvedValue([{ id: ID, name: 'GitHub' } as EntryView])
    const { result } = renderHook(() => useVaultEntries())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.byId.get(ID)?.name).toBe('GitHub')
    expect(api.listEntries).toHaveBeenCalledTimes(1)
  })

  test('reports the error message on reject', async () => {
    api.vaultEnabled.mockReturnValue(true)
    api.listEntries.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useVaultEntries())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('boom')
  })
})
