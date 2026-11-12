// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readViewed, useViewed, viewedKey, writeViewed } from './viewed'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('viewed', () => {
  it('keys by proposal, revision and path', () => {
    expect(viewedKey(7, 2, 'env.A')).toBe('agents-web:proposal-viewed:7:2:env.A')
  })

  it('writes, reads and removes the mark', () => {
    const k = viewedKey(7, 2, 'model')
    expect(readViewed(k)).toBe(false)
    writeViewed(k, true)
    expect(readViewed(k)).toBe(true)
    expect(localStorage.getItem(k)).toBe('1')
    writeViewed(k, false)
    expect(localStorage.getItem(k)).toBeNull()
    expect(readViewed(k)).toBe(false)
  })

  it('storage failures read as unviewed and never throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readViewed('k')).toBe(false)
    expect(() => writeViewed('k', true)).not.toThrow()
    expect(() => writeViewed('k', false)).not.toThrow()
  })

  it('useViewed starts from storage and writes through', () => {
    const k = viewedKey(1, 1, 'a')
    writeViewed(k, true)
    const { result } = renderHook(() => useViewed(k))
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem(k)).toBeNull()
  })

  it('useViewed without a key never touches storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem')
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => useViewed(undefined))
    expect(result.current[0]).toBe(false)
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(false)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })
})
