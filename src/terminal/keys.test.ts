import { describe, expect, test } from 'vitest'
import { KEY_SEQUENCES, applyCtrl } from './keys'

describe('applyCtrl', () => {
  test.each([
    ['c', '\x03'],
    ['C', '\x03'],
    ['[', '\x1b'],
    ['@', '\x00'],
    ['?', '\x7f'],
    [' ', '\x00'],
    ['\\', '\x1c'],
    [']', '\x1d'],
    ['^', '\x1e'],
    ['_', '\x1f'],
    ['1', '1'],
    ['cd', '\x03d'],
    ['', ''],
  ])('%j becomes %j', (input, out) => {
    expect(applyCtrl(input)).toBe(out)
  })
})

test('key sequences', () => {
  expect(KEY_SEQUENCES).toEqual({ Esc: '\x1b', Tab: '\t', Up: '\x1b[A', Down: '\x1b[B', Right: '\x1b[C', Left: '\x1b[D' })
})
