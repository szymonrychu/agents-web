// @vitest-environment jsdom
import { undoDepth } from '@codemirror/commands'
import { pythonLanguage } from '@codemirror/lang-python'
import { language, type Language } from '@codemirror/language'
import { diagnosticCount, forceLinting } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { act, cleanup, render, screen } from '@testing-library/react'
import { hclLanguage } from 'codemirror-lang-hcl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CodeEditor, { type CodeEditorProps } from './CodeEditor'

// jsdom has no layout: CodeMirror measures through these, so they answer empty geometry (web-libs-docs B23, B24).
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
  vi.useRealTimers()
})

/** Mounts the editor; `rerender` merges new props into the current ones, `view()` reads the live view from the root. */
function mount(over: Partial<CodeEditorProps> = {}) {
  let props: CodeEditorProps = { path: 'main.py', doc: 'x = 1\n', docVersion: 1, readOnly: true, onChange: vi.fn(), onSave: vi.fn(), ...over }
  const r = render(<CodeEditor {...props} />)
  const root = screen.getByTestId('file-editor')
  const view = () => {
    const v = EditorView.findFromDOM(root)
    if (!v) throw new Error('no editor view under the root')
    return v
  }
  const rerender = (more: Partial<CodeEditorProps>) => {
    props = { ...props, ...more }
    r.rerender(<CodeEditor {...props} />)
  }
  return { props, root, view, rerender, unmount: r.unmount }
}

const editable = (view: EditorView) => view.contentDOM.getAttribute('contenteditable')

/** A keydown on the content element; answers whether the editor prevented the default. */
function keydown(view: EditorView, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  view.contentDOM.dispatchEvent(event)
  return event.defaultPrevented
}

describe('CodeEditor', () => {
  it('read-only toggle keeps the view, its doc, selection and undo history', () => {
    const { view, rerender } = mount({ doc: 'a = 1\nb = 2\n', readOnly: true })
    const before = view()
    expect(before.state.readOnly).toBe(true)
    expect(editable(before)).not.toBe('true')

    before.dispatch({ changes: { from: 0, insert: 'c = 0\n' }, selection: { anchor: 3, head: 5 } })
    const doc = before.state.sliceDoc()
    const selection = before.state.selection.toJSON()
    expect(undoDepth(before.state)).toBe(1)

    rerender({ readOnly: false })
    expect(view()).toBe(before)
    expect(before.state.readOnly).toBe(false)
    expect(editable(before)).toBe('true')
    expect(before.state.sliceDoc()).toBe(doc)
    expect(before.state.selection.toJSON()).toEqual(selection)
    expect(undoDepth(before.state)).toBe(1)

    rerender({ readOnly: true })
    expect(view()).toBe(before)
    expect(before.state.readOnly).toBe(true)
    expect(editable(before)).not.toBe('true')
    expect(before.state.sliceDoc()).toBe(doc)
    expect(undoDepth(before.state)).toBe(1)
  })

  it.each<[string, Language | 'toml' | null]>([
    ['main.py', pythonLanguage],
    ['main.tf', hclLanguage],
    ['pyproject.toml', 'toml'],
    ['notes.txt', null],
  ])('language by path: %s', (path, expected) => {
    const lang = mount({ path, doc: 'a = 1\n' }).view().state.facet(language)
    if (expected === 'toml') expect(lang?.name).toBe('toml')
    else expect(lang).toBe(expected)
  })

  it('language by path follows a new path on the same view, keeping the doc and history', () => {
    const { view, rerender } = mount({ path: 'notes.txt', doc: 'a = 1\n' })
    const before = view()
    before.dispatch({ changes: { from: 0, insert: 'b = 2\n' } })
    rerender({ path: 'main.py' })
    expect(view()).toBe(before)
    expect(before.state.facet(language)).toBe(pythonLanguage)
    expect(before.state.sliceDoc()).toBe('b = 2\na = 1\n')
    expect(undoDepth(before.state)).toBe(1)
  })

  it.each([
    ['LF', 'one\ntwo\n'],
    ['CRLF', 'one\r\ntwo\r\n'],
    ['mixed LF/CRLF', 'one\r\ntwo\nthree\r\n'],
    ['no trailing newline', 'one\ntwo'],
    ['byte-order mark', '﻿one\ntwo\n'],
  ])('line endings round-trip: %s', (_, text) => {
    const { state } = mount({ doc: text, path: 'notes.txt' }).view()
    // the state's own text, joined with its line separator, is what onChange reports
    expect(state.sliceDoc()).toBe(text)
    expect(state.lineBreak).toBe(text.includes('\r\n') ? '\r\n' : '\n')
    if (!text.includes('\r\n')) expect(state.doc.toString()).toBe(text)
  })

  it('line endings round-trip: an insertion in a CRLF file keeps CRLF on every other line', () => {
    const onChange = vi.fn()
    const { view } = mount({ doc: 'one\r\ntwo\r\nthree\r\n', readOnly: false, onChange })
    const v = view()
    v.dispatch({ changes: { from: v.state.doc.line(2).from, insert: 'new\r\n' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('one\r\nnew\r\ntwo\r\nthree\r\n')
  })

  it('onChange on doc changes with the full text, not on selection-only changes, through the latest callback', () => {
    const first = vi.fn()
    const { view, rerender } = mount({ doc: 'abc\n', readOnly: false, onChange: first })
    const v = view()
    v.dispatch({ changes: { from: 3, insert: 'd' } })
    v.dispatch({ changes: { from: 0, to: 1 } })
    expect(first.mock.calls).toEqual([['abcd\n'], ['bcd\n']])

    v.dispatch({ selection: { anchor: 2 } })
    expect(first).toHaveBeenCalledTimes(2)

    const second = vi.fn()
    rerender({ onChange: second })
    expect(view()).toBe(v)
    v.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(second).toHaveBeenCalledWith('xbcd\n')
    expect(first).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('mod-s saves with readOnly %s, preventing the browser save', (readOnly) => {
    const onSave = vi.fn()
    const { view, rerender } = mount({ readOnly, onSave })
    const v = view()
    expect(keydown(v, { key: 's', ctrlKey: true })).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(keydown(v, { key: 's', metaKey: true })).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(keydown(v, { key: 's' })).toBe(false)
    expect(onSave).toHaveBeenCalledTimes(2)

    const latest = vi.fn()
    rerender({ onSave: latest })
    expect(view()).toBe(v)
    expect(keydown(v, { key: 's', ctrlKey: true })).toBe(true)
    expect(latest).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('docVersion resets the document and clears history; the same docVersion keeps the edit', () => {
    const onChange = vi.fn()
    const { view, rerender } = mount({ path: 'main.py', doc: 'a = 1\n', docVersion: 1, readOnly: false, onChange })
    const v = view()
    v.dispatch({ changes: { from: 0, insert: 'b = 2\n' } })
    expect(undoDepth(v.state)).toBe(1)

    rerender({ doc: 'a = 1\n', docVersion: 1 })
    expect(v.state.sliceDoc()).toBe('b = 2\na = 1\n')
    expect(undoDepth(v.state)).toBe(1)

    rerender({ doc: 'c = 3\r\nd = 4\r\n', docVersion: 2 })
    expect(view()).toBe(v)
    expect(v.state.sliceDoc()).toBe('c = 3\r\nd = 4\r\n')
    expect(v.state.lineBreak).toBe('\r\n')
    expect(undoDepth(v.state)).toBe(0)
    expect(v.state.readOnly).toBe(false)
    expect(editable(v)).toBe('true')
    expect(v.state.facet(language)).toBe(pythonLanguage)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('no hints: typing in python shows no tooltip of any kind', async () => {
    vi.useFakeTimers()
    const { view } = mount({ path: 'main.py', doc: 'import os\n', readOnly: false })
    const v = view()
    const end = v.state.doc.length
    act(() => {
      v.dispatch({ changes: { from: end, insert: 'i' }, selection: { anchor: end + 1 }, userEvent: 'input.type' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(v.state.sliceDoc()).toBe('import os\ni')
    expect(document.querySelectorAll('.cm-tooltip')).toHaveLength(0)
  })

  it('syntax marks: a broken JSON document gets a diagnostic and the lint gutter', async () => {
    const { view, root } = mount({ path: 'package.json', doc: '{"a": 1,,}\n' })
    const v = view()
    expect(root.querySelector('.cm-gutter-lint')).not.toBeNull()
    act(() => forceLinting(v))
    await vi.waitFor(() => expect(diagnosticCount(v.state)).toBeGreaterThanOrEqual(1))
  })

  it('destroyed on unmount: no editor element remains and the root finds no view', () => {
    const { root, view, unmount } = mount()
    expect(view()).toBeInstanceOf(EditorView)
    expect(document.querySelector('.cm-editor')).not.toBeNull()
    unmount()
    expect(document.querySelector('.cm-editor')).toBeNull()
    expect(EditorView.findFromDOM(root)).toBeNull()
  })
})
