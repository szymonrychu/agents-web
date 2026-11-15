// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setViewport } from '../test/viewport'
import { useVisualViewport } from './useVisualViewport'

class FakeViewport extends EventTarget {
  height = 700
  offsetTop = 0
}

let vv: FakeViewport
let frames: FrameRequestCallback[]
const flushFrames = () => {
  const pending = frames
  frames = []
  for (const cb of pending) cb(0)
}
const prop = (name: string) => document.documentElement.style.getPropertyValue(name)

beforeEach(() => {
  vv = new FakeViewport()
  frames = []
  vi.stubGlobal('visualViewport', vv)
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => frames.push(cb)))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames[id - 1] = () => {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--app-height')
  document.documentElement.style.removeProperty('--app-top')
})

describe('useVisualViewport on touch', () => {
  beforeEach(() => setViewport(375, { coarse: true }))

  test('mount writes the visible height and offset', () => {
    renderHook(() => useVisualViewport())
    expect(prop('--app-height')).toBe('700px')
    expect(prop('--app-top')).toBe('0px')
  })

  test('resize and scroll update the variables', () => {
    renderHook(() => useVisualViewport())
    vv.height = 400
    vv.dispatchEvent(new Event('resize'))
    flushFrames()
    expect(prop('--app-height')).toBe('400px')
    vv.offsetTop = 120
    vv.dispatchEvent(new Event('scroll'))
    flushFrames()
    expect(prop('--app-top')).toBe('120px')
  })

  test('two events in one frame cause one write', () => {
    renderHook(() => useVisualViewport())
    vv.height = 400.4
    vv.dispatchEvent(new Event('resize'))
    vv.offsetTop = 50
    vv.dispatchEvent(new Event('scroll'))
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    flushFrames()
    expect(prop('--app-height')).toBe('400px')
    expect(prop('--app-top')).toBe('50px')
  })

  test('unmount removes both properties and both listeners', () => {
    const add = vi.spyOn(vv, 'addEventListener')
    const remove = vi.spyOn(vv, 'removeEventListener')
    const { unmount } = renderHook(() => useVisualViewport())
    vv.dispatchEvent(new Event('resize'))
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(prop('--app-height')).toBe('')
    expect(prop('--app-top')).toBe('')
    for (const type of ['resize', 'scroll']) {
      const handler = add.mock.calls.find((c) => c[0] === type)?.[1]
      expect(handler).toBeTruthy()
      expect(remove).toHaveBeenCalledWith(type, handler)
    }
  })
})

test('a desktop with a mouse writes nothing and adds no listener', () => {
  setViewport(1440)
  const add = vi.spyOn(vv, 'addEventListener')
  renderHook(() => useVisualViewport())
  expect(add).not.toHaveBeenCalled()
  expect(prop('--app-height')).toBe('')
})

test('without visualViewport nothing is written and nothing throws', () => {
  setViewport(375, { coarse: true })
  vi.stubGlobal('visualViewport', undefined)
  expect(() => renderHook(() => useVisualViewport())).not.toThrow()
  expect(prop('--app-height')).toBe('')
})
