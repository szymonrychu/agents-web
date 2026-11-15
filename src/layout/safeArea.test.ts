import { describe, expect, test } from 'vitest'
import { safeArea, safeInset } from './safeArea'

describe('safeArea', () => {
  test('safeInset grows a base padding to the device inset', () => {
    expect(safeInset('top')).toBe('max(0px, env(safe-area-inset-top))')
    expect(safeInset('bottom', 16)).toBe('max(16px, env(safe-area-inset-bottom))')
  })

  test('safeArea pads the given sides only', () => {
    expect(safeArea(['left', 'right'], 8)).toEqual({
      paddingLeft: 'max(8px, env(safe-area-inset-left))',
      paddingRight: 'max(8px, env(safe-area-inset-right))',
    })
  })
})
