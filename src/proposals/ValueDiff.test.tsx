// @vitest-environment jsdom
import { MergeView } from '@codemirror/merge'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ValueDiff from './ValueDiff'

// jsdom has no layout: CodeMirror measures through these, so they answer empty geometry.
const original = { rects: Range.prototype.getClientRects, box: Range.prototype.getBoundingClientRect }
beforeAll(() => {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterAll(() => {
  Range.prototype.getClientRects = original.rects
  Range.prototype.getBoundingClientRect = original.box
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ValueDiff', () => {
  it('renders a scalar as a two-column text row', () => {
    const { container } = render(<ValueDiff before="old" after={3} />)
    expect(screen.getByTestId('value-diff-before').textContent).toBe('old')
    expect(screen.getByTestId('value-diff-after').textContent).toBe('3')
    expect(container.querySelector('.cm-mergeView')).toBeNull()
  })

  it('renders null and booleans as text', () => {
    render(<ValueDiff before={null} after={false} />)
    expect(screen.getByTestId('value-diff-before').textContent).toBe('null')
    expect(screen.getByTestId('value-diff-after').textContent).toBe('false')
  })

  it('mounts one merge view holding both sorted YAML texts for an object', () => {
    const { container } = render(<ValueDiff before={{ b: 1, a: { x: 'one' } }} after={{ a: { x: 'two' }, b: 1 }} />)
    const views = container.querySelectorAll('.cm-mergeView')
    expect(views).toHaveLength(1)
    const text = views[0].textContent ?? ''
    expect(text).toContain('x: one')
    expect(text).toContain('x: two')
    expect(text.indexOf('a:')).toBeLessThan(text.indexOf('b: 1'))
    expect(views[0].querySelectorAll('.cm-content[contenteditable="true"]')).toHaveLength(0)
  })

  it('renders arrays through the merge view', () => {
    const { container } = render(<ValueDiff before={['a']} after={['a', 'b']} />)
    expect(container.querySelectorAll('.cm-mergeView')).toHaveLength(1)
  })

  it('destroys the merge view on unmount', () => {
    const destroy = vi.spyOn(MergeView.prototype, 'destroy')
    const { unmount } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(destroy).not.toHaveBeenCalled()
    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('renders no revert controls', () => {
    const { container } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(container.querySelectorAll('.cm-deletedChunk, .cm-changedLine').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
