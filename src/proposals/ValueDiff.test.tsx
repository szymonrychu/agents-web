// @vitest-environment jsdom
import { getOriginalDoc, MergeView } from '@codemirror/merge'
import { EditorView } from '@codemirror/view'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../theme'
import ValueDiff from './ValueDiff'
import { toDoc } from './diffText'

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
/** Installs a matchMedia that evaluates min-width / max-width queries against `width`. */
function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

beforeEach(() => setViewport(1200))
afterEach(() => {
  built.configs.length = 0
  built.views.length = 0
  cleanup()
  vi.restoreAllMocks()
})

describe('ValueDiff', () => {
  it('a scalar diffs in the merge view', () => {
    const { container } = render(<ValueDiff before="old" after={3} />)
    expect(container.querySelectorAll('.cm-mergeView')).toHaveLength(1)
    const view = built.views[0] as MergeView
    expect(view.a.state.doc.toString()).toBe('old')
    expect(view.b.state.doc.toString()).toBe('3')
    expect(screen.queryByTestId('value-diff-before')).toBeNull()
  })

  it('null and booleans become empty and literal docs', () => {
    render(<ValueDiff before={null} after={false} />)
    const view = built.views[0] as MergeView
    expect(view.a.state.doc.toString()).toBe('')
    expect(view.b.state.doc.toString()).toBe('false')
  })

  it('a one-word edit is marked inside the line', () => {
    const { container } = render(<ValueDiff before="run the old job" after="run the new job" />)
    expect(container.querySelectorAll('.cm-changedText').length).toBeGreaterThan(0)
  })

  it('captions name the panes and label the editors', () => {
    const { rerender } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.getByText('Proposed')).toBeTruthy()
    let view = built.views[0] as MergeView
    expect(view.a.contentDOM.getAttribute('aria-label')).toBe('Current')
    expect(view.b.contentDOM.getAttribute('aria-label')).toBe('Proposed')
    rerender(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} labels={['v1', 'v2']} />)
    expect(screen.getByText('v1')).toBeTruthy()
    expect(screen.getByText('v2')).toBeTruthy()
    view = built.views[built.views.length - 1] as MergeView
    expect(view.a.contentDOM.getAttribute('aria-label')).toBe('v1')
    expect(view.b.contentDOM.getAttribute('aria-label')).toBe('v2')
  })

  it('expanded drops the collapse', () => {
    const destroy = vi.spyOn(MergeView.prototype, 'destroy')
    const { rerender } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(built.configs[0].collapseUnchanged).toEqual({ margin: 3 })
    rerender(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} expanded />)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(built.configs).toHaveLength(2)
    expect('collapseUnchanged' in built.configs[1]).toBe(false)
  })

  it('narrow screens render one unified read-only editor without merge controls', () => {
    setViewport(400)
    const { container } = render(<ValueDiff before={{ a: 1 }} after={{ a: 2 }} />)
    expect(container.querySelector('.cm-mergeView')).toBeNull()
    const host = screen.getByTestId('value-diff-unified')
    const editors = host.querySelectorAll('.cm-editor')
    expect(editors).toHaveLength(1)
    const view = EditorView.findFromDOM(editors[0] as HTMLElement)
    expect(view).not.toBeNull()
    expect(view!.state.doc.toString()).toBe(toDoc({ a: 2 }))
    expect(getOriginalDoc(view!.state).toString()).toBe(toDoc({ a: 1 }))
    expect(host.querySelector('.cm-deletedChunk')).not.toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(view!.contentDOM.getAttribute('contenteditable')).toBe('false')
    expect(view!.contentDOM.getAttribute('aria-label')).toBe('Current to Proposed')
    expect(screen.queryByText('Current')).toBeNull()
  })

  it('narrow unified view collapses unchanged runs unless expanded', () => {
    setViewport(400)
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`)
    const changed = lines.map((l, i) => (i === 10 ? 'changed' : l))
    const { container, rerender } = render(<ValueDiff text before={lines.join('\n')} after={changed.join('\n')} />)
    expect(container.querySelector('.cm-collapsedLines')).not.toBeNull()
    rerender(<ValueDiff text before={lines.join('\n')} after={changed.join('\n')} expanded />)
    expect(container.querySelector('.cm-collapsedLines')).toBeNull()
  })

  it('the host grows with content up to a max', () => {
    render(<ValueDiff text before={'a\nb'} after={'a\nc'} />)
    const host = screen.getByTestId('value-diff-merge')
    expect(getComputedStyle(host).overflow).toBe('auto')
    // jsdom resolves vh to pixels in computed styles, so check the emitted rule
    const css = Array.from(document.querySelectorAll('style'), (el) => el.textContent ?? '').join('')
    expect(css).toMatch(/max-height:60vh/)
    expect(css).not.toMatch(/height:360px/)
  })

  it('reports line counts', () => {
    const onCounts = vi.fn()
    const { rerender } = render(<ValueDiff text before={'a\nb'} after={'a\nc'} onCounts={onCounts} />)
    expect(onCounts).toHaveBeenLastCalledWith({ added: 1, removed: 1 })
    const next = vi.fn()
    rerender(<ValueDiff text before={'a\nb'} after={'a\nc'} onCounts={next} />)
    expect(built.views).toHaveLength(1)
  })

  it('follows the palette mode', () => {
    render(
      <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
        <ValueDiff before={{ a: 1 }} after={{ a: 2 }} />
      </ThemeProvider>,
    )
    expect((built.views[0] as MergeView).a.state.facet(EditorView.darkTheme)).toBe(false)
    cleanup()
    render(
      <ThemeProvider theme={theme}>
        <ValueDiff before={{ a: 1 }} after={{ a: 2 }} />
      </ThemeProvider>,
    )
    expect((built.views[built.views.length - 1] as MergeView).a.state.facet(EditorView.darkTheme)).toBe(true)
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
    expect(built.configs[0].gutter).toBe(true)
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
