// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { TOUCH_OR_SMALL_QUERY } from '../theme'
import { setViewport } from './viewport'

const matches = (q: string) => window.matchMedia(q).matches

describe('setViewport', () => {
  test('the touch-or-small gate follows touch, hover and width', () => {
    setViewport(375, { coarse: true })
    expect(matches(TOUCH_OR_SMALL_QUERY)).toBe(true)
    setViewport(1440)
    expect(matches(TOUCH_OR_SMALL_QUERY)).toBe(false)
    setViewport(1000)
    expect(matches(TOUCH_OR_SMALL_QUERY)).toBe(false)
    setViewport(800)
    expect(matches(TOUCH_OR_SMALL_QUERY)).toBe(true)
  })

  test('min-width flips at its bound', () => {
    setViewport(599)
    expect(matches('@media (min-width:600px)')).toBe(false)
    setViewport(600)
    expect(matches('@media (min-width:600px)')).toBe(true)
  })

  test('and combines features and height defaults to 800', () => {
    setViewport(844, { coarse: true, height: 390 })
    expect(matches('(pointer: coarse) and (max-height: 500px)')).toBe(true)
    setViewport(844, { coarse: true })
    expect(matches('(pointer: coarse) and (max-height: 500px)')).toBe(false)
    expect(window.innerHeight).toBe(800)
  })

  test('unknown features never match', () => {
    setViewport(400)
    expect(matches('(prefers-color-scheme: dark)')).toBe(false)
  })
})
