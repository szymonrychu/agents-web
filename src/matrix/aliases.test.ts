import { describe, expect, test } from 'vitest'
import { formatAliases, parseAliases } from './aliases'

describe('aliases', () => {
  test('parseAliases splits on commas, trims and drops empty entries', () => {
    expect(parseAliases(' bot, @Agent ,, ')).toEqual(['bot', '@Agent'])
    expect(parseAliases('')).toEqual([])
  })

  test('formatAliases joins with a comma and a space', () => {
    expect(formatAliases(['bot', 'Agent'])).toBe('bot, Agent')
  })
})
