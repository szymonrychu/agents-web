// @vitest-environment jsdom
import { MergeView } from '@codemirror/merge'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import ValueDiff from './ValueDiff'

// records the config and instance of every MergeView the component builds
const built = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[], views: [] as unknown[] }))
vi.mock('@codemirror/merge', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@codemirror/merge')>()
  class RecordingMergeView extends mod.MergeView {
    constructor(config: ConstructorParameters<typeof mod.MergeView>[0]) {
      super(config)
      built.configs.push(config as unknown as Record<string, unknown>)
      built.views.push(this)
    }
  }
  return { ...mod, MergeView: RecordingMergeView }
})

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
  built.configs.length = 0
  built.views.length = 0
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
    expect(built.configs).toHaveLength(1)
    expect(built.configs[0].revertControls).toBeUndefined()
  })

  it('builds an a-b merge view that collapses unchanged runs with a margin of 3', () => {
    render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(built.configs).toHaveLength(1)
    expect(built.configs[0].orientation).toBe('a-b')
    expect(built.configs[0].collapseUnchanged).toEqual({ margin: 3 })
  })

  it('makes both sides read-only and not editable', () => {
    render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    const view = built.views[0] as MergeView
    for (const side of [view.a, view.b]) {
      expect(side.state.readOnly).toBe(true)
      expect(side.contentDOM.getAttribute('contenteditable')).toBe('false')
    }
  })

  it('text mode diffs two strings as raw text in a merge view, not YAML', () => {
    const { container } = render(<ValueDiff text before={'line one\nold line'} after={'line one\nnew line'} />)
    expect(container.querySelectorAll('.cm-mergeView')).toHaveLength(1)
    expect(container.querySelector('[data-testid="value-diff-before"]')).toBeNull()
    const view = built.views[0] as MergeView
    expect(view.a.state.doc.toString()).toBe('line one\nold line')
    expect(view.b.state.doc.toString()).toBe('line one\nnew line')
  })

  it('keeps the merge view a block so the editors row spans it, with both panes holding their own text', () => {
    const { container } = render(<ValueDiff text before={'same\nold line'} after={'same\nnew line'} />)
    const view = container.querySelector('.cm-mergeView') as HTMLElement
    expect(getComputedStyle(view).display).not.toBe('flex')
    const editors = view.querySelector('.cm-mergeViewEditors') as HTMLElement
    expect(getComputedStyle(editors).display).toBe('flex')
    const panes = editors.querySelectorAll(':scope > .cm-mergeViewEditor')
    expect(panes).toHaveLength(2)
    expect(panes[0].textContent).toContain('old line')
    expect(panes[0].textContent).not.toContain('new line')
    expect(panes[1].textContent).toContain('new line')
    expect(panes[1].textContent).not.toContain('old line')
  })

  it('text mode treats a missing side as empty text', () => {
    render(<ValueDiff text before={null} after="hello" />)
    const view = built.views[0] as MergeView
    expect(view.a.state.doc.toString()).toBe('')
    expect(view.b.state.doc.toString()).toBe('hello')
  })

  it('rebuilds the merge view when the compared values change', () => {
    const destroy = vi.spyOn(MergeView.prototype, 'destroy')
    const { rerender, container } = render(<ValueDiff text before={'one\nold'} after={'one\nnew'} />)
    rerender(<ValueDiff text before={'two\nolder'} after={'two\nnewer'} />)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('.cm-mergeView')).toHaveLength(1)
    const view = built.views[built.views.length - 1] as MergeView
    expect(view.a.state.doc.toString()).toBe('two\nolder')
    expect(view.b.state.doc.toString()).toBe('two\nnewer')
  })

  it('does not rebuild when re-rendered with equal values', () => {
    const { rerender } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    rerender(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(built.views).toHaveLength(1)
  })

  it('sizes the editors to their content inside the scrolling host, not to 100% of it', () => {
    const { container } = render(<ValueDiff text before={'a long line '.repeat(80)} after={'b long line '.repeat(80)} />)
    const host = screen.getByTestId('value-diff-merge')
    expect(getComputedStyle(host).overflow).toBe('auto')
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(2)
    // jsdom does not resolve CodeMirror's scoped theme, so check the host's own emitted rule
    const css = Array.from(document.querySelectorAll('style'), (el) => el.textContent ?? '').join('')
    expect(css).toMatch(/\.cm-editor\{[^}]*height:auto/)
  })
})
