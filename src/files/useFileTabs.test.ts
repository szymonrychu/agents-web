// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { FileContent, FileWritten } from '../api/files'
import { useFileTabs } from './useFileTabs'
import type { FileTabs } from './useFileTabs'

const api = vi.hoisted(() => ({ listFiles: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('../api/files', () => api)

const content = (path: string, over: Partial<FileContent> = {}): FileContent => ({
  agent_id: 'a1',
  session_id: 's1',
  content: 'one',
  kind: 'text',
  mime: 'text/plain',
  mtime: 'm1',
  path,
  size: 3,
  ...over,
})
const text = (path: string, body: string, mtime: string) => content(path, { content: body, mtime, size: body.length })
const saved = (path: string, mtime: string, size: number): FileWritten => ({ agent_id: 'a1', session_id: 's1', path, mtime, size })

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Answers readFile per path from a queue (each call takes the next answer, the last one repeats). */
function serve(answers: Record<string, (FileContent | Error | Promise<FileContent>)[]>) {
  api.readFile.mockImplementation((_s: string, path: string) => {
    const queue = answers[path]
    if (!queue || queue.length === 0) return Promise.reject(new ApiError(404, 'not_found', 'no such file'))
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  })
}

const reads = (path: string) => api.readFile.mock.calls.filter((c) => c[1] === path).length
const tab = (r: { current: FileTabs }, path: string) => {
  const t = r.current.tabs.find((x) => x.path === path)
  if (!t) throw new Error(`no tab ${path}`)
  return t
}
const settle = () => act(async () => {})

beforeEach(() => {
  api.readFile.mockReset()
  api.writeFile.mockReset()
})
afterEach(() => cleanup())

describe('useFileTabs', () => {
  test('open and focus', async () => {
    serve({
      'src/a.py': [text('src/a.py', 'print(1)', 'm1')],
      'b.bin': [content('b.bin', { kind: 'binary', content: null, mime: 'application/octet-stream', size: 9 })],
      'big.log': [content('big.log', { kind: 'too_large', content: null, size: 99999 })],
    })
    const { result } = renderHook(() => useFileTabs('open-1'))
    expect(result.current.tabs).toEqual([])
    expect(result.current.active).toBeNull()

    act(() => result.current.open('src/a.py', 'file'))
    expect(tab(result, 'src/a.py').name).toBe('a.py')
    expect(tab(result, 'src/a.py').kind).toBe('loading')
    expect(result.current.active).toBe('src/a.py')
    expect(api.readFile).toHaveBeenCalledWith('open-1', 'src/a.py')
    await settle()
    expect(tab(result, 'src/a.py')).toMatchObject({
      kind: 'text',
      doc: 'print(1)',
      mode: 'ro',
      baseline: { mtime: 'm1', size: 8 },
      dirty: false,
      saving: false,
      saveError: null,
      conflict: false,
      changedOnDisk: false,
      error: null,
    })
    expect(tab(result, 'src/a.py').file?.content).toBe('print(1)')

    act(() => result.current.open('b.bin', 'file'))
    act(() => result.current.open('big.log', 'symlink'))
    act(() => result.current.open('fifo', 'other'))
    act(() => result.current.open('gone.txt', 'file'))
    await settle()
    expect(tab(result, 'b.bin').kind).toBe('binary')
    expect(tab(result, 'big.log').kind).toBe('too_large')
    expect(tab(result, 'fifo').kind).toBe('other')
    expect(reads('fifo')).toBe(0)
    expect(tab(result, 'gone.txt')).toMatchObject({ kind: 'error', error: 'not_found: no such file' })
    expect(result.current.active).toBe('gone.txt')

    act(() => result.current.open('src/a.py', 'file'))
    expect(result.current.active).toBe('src/a.py')
    expect(reads('src/a.py')).toBe(1)
    expect(result.current.tabs.map((t) => t.path)).toEqual(['src/a.py', 'b.bin', 'big.log', 'fifo', 'gone.txt'])

    act(() => result.current.focus('big.log'))
    expect(result.current.active).toBe('big.log')
    act(() => result.current.focus('not-open'))
    expect(result.current.active).toBe('big.log')
  })

  test('close picks the neighbour', async () => {
    serve({ a: [text('a', 'a', 'm1')], b: [text('b', 'b', 'm1')], c: [text('c', 'c', 'm1')], x: [text('x', 'x', 'm1')], y: [text('y', 'y', 'm1')] })
    const { result } = renderHook(() => useFileTabs('close-1'))
    act(() => {
      result.current.open('a', 'file')
      result.current.open('b', 'file')
      result.current.open('c', 'file')
    })
    await settle()
    act(() => result.current.focus('b'))
    act(() => result.current.close('b'))
    expect(result.current.tabs.map((t) => t.path)).toEqual(['a', 'c'])
    expect(result.current.active).toBe('c')
    act(() => result.current.close('c'))
    expect(result.current.active).toBe('a')
    act(() => result.current.close('a'))
    expect(result.current.tabs).toEqual([])
    expect(result.current.active).toBeNull()

    act(() => {
      result.current.open('x', 'file')
      result.current.open('y', 'file')
    })
    act(() => result.current.close('x'))
    expect(result.current.active).toBe('y')
    expect(result.current.tabs.map((t) => t.path)).toEqual(['y'])

    // a read answering after its tab closed changes nothing, also once the path is open again
    const first = deferred<FileContent>()
    const second = deferred<FileContent>()
    api.readFile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    act(() => result.current.open('late', 'file'))
    act(() => result.current.close('late'))
    await act(async () => first.resolve(text('late', 'old', 'm1')))
    expect(result.current.tabs.map((t) => t.path)).toEqual(['y'])
    expect(result.current.active).toBe('y')

    act(() => result.current.open('late', 'file'))
    const third = deferred<FileContent>()
    api.readFile.mockReturnValueOnce(third.promise)
    act(() => result.current.close('late'))
    act(() => result.current.open('late', 'file'))
    await act(async () => second.resolve(text('late', 'stale', 'm2')))
    expect(tab(result, 'late').kind).toBe('loading')
    await act(async () => third.resolve(text('late', 'fresh', 'm3')))
    expect(tab(result, 'late')).toMatchObject({ kind: 'text', doc: 'fresh' })
  })

  test('dirty and mode', async () => {
    serve({ a: [text('a', 'one', 'm1')] })
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useFileTabs('dirty-1')
    })
    act(() => result.current.open('a', 'file'))
    await settle()

    // an RO tab takes no edit
    act(() => result.current.edit('a', 'typed in ro'))
    expect(tab(result, 'a').dirty).toBe(false)

    act(() => result.current.setMode('a', 'rw'))
    expect(tab(result, 'a').mode).toBe('rw')
    act(() => result.current.edit('a', 'two'))
    expect(tab(result, 'a').dirty).toBe(true)

    // typing that keeps the dirty mark does not re-render
    const before = renders
    act(() => result.current.edit('a', 'three'))
    act(() => result.current.edit('a', 'four'))
    expect(renders).toBe(before)

    act(() => result.current.setMode('a', 'ro'))
    expect(tab(result, 'a').mode).toBe('rw')

    act(() => result.current.edit('a', 'one'))
    expect(tab(result, 'a').dirty).toBe(false)
    act(() => result.current.setMode('a', 'ro'))
    expect(tab(result, 'a').mode).toBe('ro')
    act(() => result.current.setMode('a', 'rw'))
    expect(tab(result, 'a').mode).toBe('rw')
  })

  test('save conflict overwrite reload', async () => {
    serve({ a: [text('a', 'one', 'm1'), text('a', 'disk', 'm9')] })
    const { result } = renderHook(() => useFileTabs('save-1'))
    act(() => result.current.open('a', 'file'))
    await settle()
    act(() => result.current.setMode('a', 'rw'))
    act(() => result.current.edit('a', 'two'))

    const write = deferred<FileWritten>()
    api.writeFile.mockReturnValueOnce(write.promise)
    act(() => result.current.save('a'))
    expect(api.writeFile).toHaveBeenLastCalledWith('save-1', 'a', 'two', { mtime: 'm1', size: 3 })
    expect(tab(result, 'a').saving).toBe(true)
    await act(async () => write.resolve(saved('a', 'm2', 3)))
    expect(tab(result, 'a')).toMatchObject({ saving: false, dirty: false, baseline: { mtime: 'm2', size: 3 }, conflict: false, saveError: null })
    act(() => result.current.edit('a', 'one'))
    expect(tab(result, 'a').dirty).toBe(true)
    act(() => result.current.edit('a', 'two'))
    expect(tab(result, 'a').dirty).toBe(false)

    act(() => result.current.edit('a', 'three'))
    api.writeFile.mockRejectedValueOnce(new ApiError(409, 'file_changed', 'file changed on disk'))
    act(() => result.current.save('a'))
    expect(api.writeFile).toHaveBeenLastCalledWith('save-1', 'a', 'three', { mtime: 'm2', size: 3 })
    await settle()
    expect(tab(result, 'a')).toMatchObject({ conflict: true, dirty: true, saving: false, saveError: null, baseline: { mtime: 'm2', size: 3 } })

    api.writeFile.mockResolvedValueOnce(saved('a', 'm3', 5))
    act(() => result.current.overwrite('a'))
    expect(api.writeFile).toHaveBeenLastCalledWith('save-1', 'a', 'three', null)
    expect(tab(result, 'a').saving).toBe(true)
    await settle()
    expect(tab(result, 'a')).toMatchObject({ conflict: false, dirty: false, saving: false, baseline: { mtime: 'm3', size: 5 } })

    act(() => result.current.edit('a', 'four'))
    api.writeFile.mockRejectedValueOnce(new ApiError(413, 'too_large', 'file too large'))
    act(() => result.current.save('a'))
    await settle()
    expect(tab(result, 'a')).toMatchObject({ saveError: 'too_large: file too large', conflict: false, dirty: true, saving: false })

    api.writeFile.mockRejectedValueOnce(new ApiError(409, 'file_changed', 'file changed on disk'))
    act(() => result.current.save('a'))
    await settle()
    act(() => result.current.written('a'))
    expect(tab(result, 'a')).toMatchObject({ conflict: true, changedOnDisk: true })

    const version = tab(result, 'a').docVersion
    act(() => result.current.reload('a'))
    await settle()
    expect(reads('a')).toBe(2)
    expect(tab(result, 'a')).toMatchObject({
      kind: 'text',
      doc: 'disk',
      docVersion: version + 1,
      dirty: false,
      conflict: false,
      changedOnDisk: false,
      saveError: null,
      mode: 'rw',
      baseline: { mtime: 'm9', size: 4 },
    })
    act(() => result.current.edit('a', 'disk'))
    expect(tab(result, 'a').dirty).toBe(false)
  })

  test('live refresh rules', async () => {
    const stamps: Record<string, string> = {}
    const stampOf = (p: string) => stamps[p] ?? null
    serve({
      a: [text('a', 'one', 'm1'), text('a', 'four', 'm2'), text('a', 'fiver', 'm3')],
      link: [content('link', { content: 'target', mtime: 't1', size: 6 })],
      data: [text('data', 'abc', 'd1'), content('data', { kind: 'binary', content: null, mtime: 'd2', size: 4 })],
    })
    const { result } = renderHook(() => useFileTabs('live-1'))
    act(() => result.current.open('a', 'file'))
    await settle()

    // the baseline stamp, an unlisted entry and an unchanged stamp trigger nothing
    stamps.a = 'm1|3'
    act(() => result.current.observe(stampOf))
    delete stamps.a
    act(() => result.current.observe(stampOf))
    expect(reads('a')).toBe(1)

    // RO tab: a changed stamp refetches, mode kept, docVersion bumped
    let version = tab(result, 'a').docVersion
    stamps.a = 'm2|4'
    act(() => result.current.observe(stampOf))
    await settle()
    expect(reads('a')).toBe(2)
    expect(tab(result, 'a')).toMatchObject({ doc: 'four', mode: 'ro', docVersion: version + 1, baseline: { mtime: 'm2', size: 4 } })
    act(() => result.current.observe(stampOf))
    expect(reads('a')).toBe(2)

    // clean RW tab: refetches too, stays RW
    act(() => result.current.setMode('a', 'rw'))
    version = tab(result, 'a').docVersion
    stamps.a = 'm3|5'
    act(() => result.current.observe(stampOf))
    await settle()
    expect(reads('a')).toBe(3)
    expect(tab(result, 'a')).toMatchObject({ doc: 'fiver', mode: 'rw', docVersion: version + 1 })

    // dirty RW tab: no refetch, only the notice; Keep editing clears it and keeps the edits
    act(() => result.current.edit('a', 'x'))
    version = tab(result, 'a').docVersion
    stamps.a = 'm4|6'
    act(() => result.current.observe(stampOf))
    expect(reads('a')).toBe(3)
    expect(tab(result, 'a')).toMatchObject({ changedOnDisk: true, dirty: true, docVersion: version })
    act(() => result.current.keepEditing('a'))
    expect(tab(result, 'a')).toMatchObject({ changedOnDisk: false, dirty: true })
    act(() => result.current.observe(stampOf))
    expect(tab(result, 'a').changedOnDisk).toBe(false)

    // the tab's own save: its new stamp is the baseline, nothing happens
    api.writeFile.mockResolvedValueOnce(saved('a', 'm5', 1))
    act(() => result.current.save('a'))
    await settle()
    stamps.a = 'm5|1'
    act(() => result.current.observe(stampOf))
    await settle()
    expect(reads('a')).toBe(3)
    expect(tab(result, 'a')).toMatchObject({ dirty: false, changedOnDisk: false, docVersion: version })

    // a refetch that answers after the user started typing keeps the edits and raises the notice
    const slow = deferred<FileContent>()
    api.readFile.mockReturnValueOnce(slow.promise)
    stamps.a = 'm6|2'
    act(() => result.current.observe(stampOf))
    act(() => result.current.edit('a', 'typed'))
    await act(async () => slow.resolve(text('a', 'zz', 'm6')))
    expect(tab(result, 'a')).toMatchObject({ dirty: true, changedOnDisk: true, docVersion: version })

    // a symlink: the listing stamps the link itself, so it refetches once, then the stamp stays stable
    act(() => result.current.open('link', 'symlink'))
    await settle()
    stamps.link = 'l1|7'
    act(() => result.current.observe(stampOf))
    await settle()
    act(() => result.current.observe(stampOf))
    await settle()
    expect(reads('link')).toBe(2)

    // a refetch answering another kind turns the tab into it
    act(() => result.current.open('data', 'file'))
    await settle()
    stamps.data = 'd2|4'
    act(() => result.current.observe(stampOf))
    await settle()
    expect(tab(result, 'data').kind).toBe('binary')

    // an "other" tab never reads
    act(() => result.current.open('fifo', 'other'))
    stamps.fifo = 'f1|0'
    act(() => result.current.observe(stampOf))
    stamps.fifo = 'f2|0'
    act(() => result.current.observe(stampOf))
    expect(reads('fifo')).toBe(0)
  })

  test('written events', async () => {
    serve({ a: [text('a', 'one', 'm1'), text('a', 'two', 'm2')] })
    const { result } = renderHook(() => useFileTabs('written-1'))
    act(() => result.current.open('a', 'file'))
    await settle()

    const version = tab(result, 'a').docVersion
    act(() => result.current.written('a'))
    await settle()
    expect(reads('a')).toBe(2)
    expect(tab(result, 'a')).toMatchObject({ doc: 'two', docVersion: version + 1, mode: 'ro' })

    act(() => result.current.setMode('a', 'rw'))
    act(() => result.current.written('a'))
    await settle()
    expect(reads('a')).toBe(3)
    expect(tab(result, 'a').mode).toBe('rw')

    act(() => result.current.edit('a', 'mine'))
    act(() => result.current.written('a'))
    await settle()
    expect(reads('a')).toBe(3)
    expect(tab(result, 'a')).toMatchObject({ changedOnDisk: true, dirty: true })

    const before = result.current.tabs
    act(() => result.current.written('nope'))
    await settle()
    expect(reads('nope')).toBe(0)
    expect(result.current.tabs).toBe(before)
  })

  test('tabs per session', async () => {
    const slow = deferred<FileContent>()
    serve({ a: [text('a', 'one', 'm1')], b: [text('b', 'bee', 'm1')], c: [text('c', 'sea', 'm1')], slow: [slow.promise] })
    const first = renderHook(() => useFileTabs('per-1'))
    act(() => {
      first.result.current.open('a', 'file')
      first.result.current.open('b', 'file')
    })
    await settle()
    act(() => first.result.current.setMode('a', 'rw'))
    act(() => first.result.current.edit('a', 'dirty a'))
    act(() => first.result.current.focus('a'))
    act(() => first.result.current.open('slow', 'file'))
    act(() => first.result.current.focus('a'))
    first.unmount()
    // the read answering while no hook is mounted still lands in the session's tabs
    await act(async () => slow.resolve(text('slow', 'late', 'm1')))
    api.readFile.mockClear()

    const again = renderHook(() => useFileTabs('per-1'))
    expect(again.result.current.tabs.map((t) => t.path)).toEqual(['a', 'b', 'slow'])
    expect(again.result.current.active).toBe('a')
    expect(tab(again.result, 'a')).toMatchObject({ mode: 'rw', dirty: true, doc: 'dirty a', baseline: { mtime: 'm1', size: 3 } })
    expect(tab(again.result, 'b')).toMatchObject({ mode: 'ro', dirty: false, doc: 'bee' })
    expect(tab(again.result, 'slow')).toMatchObject({ kind: 'text', doc: 'late' })
    expect(api.readFile).not.toHaveBeenCalled()
    api.writeFile.mockResolvedValueOnce(saved('a', 'm2', 7))
    act(() => again.result.current.save('a'))
    expect(api.writeFile).toHaveBeenLastCalledWith('per-1', 'a', 'dirty a', { mtime: 'm1', size: 3 })
    await settle()
    again.unmount()

    const other = renderHook(() => useFileTabs('per-2'))
    expect(other.result.current.tabs).toEqual([])
    expect(other.result.current.active).toBeNull()
    other.unmount()

    const switching = renderHook(({ id }) => useFileTabs(id), { initialProps: { id: 'per-1' } })
    expect(switching.result.current.tabs.map((t) => t.path)).toEqual(['a', 'b', 'slow'])
    switching.rerender({ id: 'per-3' })
    expect(switching.result.current.tabs).toEqual([])
    act(() => switching.result.current.open('c', 'file'))
    await settle()
    expect(api.readFile).toHaveBeenLastCalledWith('per-3', 'c')
    switching.rerender({ id: 'per-1' })
    expect(switching.result.current.tabs.map((t) => t.path)).toEqual(['a', 'b', 'slow'])
    expect(switching.result.current.active).toBe('a')
    expect(tab(switching.result, 'a')).toMatchObject({ mode: 'rw', dirty: false, baseline: { mtime: 'm2', size: 7 } })
    switching.rerender({ id: 'per-3' })
    expect(switching.result.current.tabs.map((t) => t.path)).toEqual(['c'])
    expect(tab(switching.result, 'c')).toMatchObject({ kind: 'text', doc: 'sea' })
  })
})
