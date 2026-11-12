import { describe, expect, it } from 'vitest'
import { diffCounts } from './diffCounts'

describe('diffCounts', () => {
  it('counts changed lines on each side', () => {
    expect(diffCounts('a\nb', 'a\nc')).toEqual({ added: 1, removed: 1 })
    expect(diffCounts('opus', 'sonnet')).toEqual({ added: 1, removed: 1 })
    expect(diffCounts('a\nb\nc', 'a\nX\nY\nc')).toEqual({ added: 2, removed: 1 })
  })

  it('an empty side counts as zero lines', () => {
    expect(diffCounts('', 'x\ny')).toEqual({ added: 2, removed: 0 })
    expect(diffCounts('x', '')).toEqual({ added: 0, removed: 1 })
  })

  it('equal texts count nothing', () => {
    expect(diffCounts('same\ntext', 'same\ntext')).toEqual({ added: 0, removed: 0 })
  })
})
