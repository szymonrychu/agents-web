import { describe, expect, test } from 'vitest'
import { KEY_SEQUENCES, applyCtrl, forCursorMode } from './keys'

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

describe('forCursorMode', () => {
  test('normal mode keeps every sequence', () => {
    for (const seq of Object.values(KEY_SEQUENCES)) expect(forCursorMode(seq, false)).toBe(seq)
  })

  test('application mode turns CSI arrows into SS3 and keeps other keys', () => {
    expect(forCursorMode(KEY_SEQUENCES.Up, true)).toBe('\x1bOA')
    expect(forCursorMode(KEY_SEQUENCES.Down, true)).toBe('\x1bOB')
    expect(forCursorMode(KEY_SEQUENCES.Right, true)).toBe('\x1bOC')
    expect(forCursorMode(KEY_SEQUENCES.Left, true)).toBe('\x1bOD')
    expect(forCursorMode(KEY_SEQUENCES.Esc, true)).toBe('\x1b')
    expect(forCursorMode(KEY_SEQUENCES.Tab, true)).toBe('\t')
  })
})
