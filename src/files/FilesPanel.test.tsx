// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { FileContent, FileListing } from '../api/files'
import type { StreamOptions } from '../api/stream'
import type { CodeEditorProps } from '../editor/CodeEditor'
import { theme } from '../theme'
import { FilesPanel } from './FilesPanel'
import { useFileTabs } from './useFileTabs'
import { useFileTree } from './useFileTree'

const api = vi.hoisted(() => ({ listFiles: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), fileDownloadUrl: (sessionId: string, path: string) => `/dl/${sessionId}?path=${path}` }))
const stream = vi.hoisted(() => ({ opened: [] as { url: string; opts: StreamOptions }[], close: vi.fn() }))
const viewport = vi.hoisted(() => ({ layout: 'desktop' as 'phone' | 'tablet' | 'desktop' }))

vi.mock('../api/files', () => api)
// jsdom has no media queries: the test chooses the layout class.
vi.mock('../layout/useLayout', () => ({ useLayout: () => viewport.layout }))
// CodeMirror does not run under jsdom: a stand-in that takes the real props, shows the doc, and calls back.
vi.mock('../editor/CodeEditor', () => ({
  default: function CodeEditorStandIn(props: CodeEditorProps) {
    return (
      <div data-testid="file-editor" data-readonly={String(props.readOnly)} data-path={props.path}>
        <span>{props.doc}</span>
        <button type="button" onClick={() => props.onChange('changed text')}>
          stand-in change
        </button>
      </div>
    )
  },
}))
vi.mock('../api/stream', () => ({
  openStream: (url: string, opts: StreamOptions) => {
    stream.opened.push({ url, opts })
    return { close: stream.close }
  },
}))

type Entry = FileListing['entries'][number]
const entry = (name: string, type: Entry['type'] = 'file'): Entry => ({ name, type, size: type === 'file' ? 10 : null, mtime: '2026-10-23T00:00:00Z', target_type: null })
const symlink = (name: string, target_type: Entry['target_type']): Entry => ({ ...entry(name, 'symlink'), target_type })
const listing = (path: string, entries: Entry[], next_offset: number | null = null): FileListing => ({
  agent_id: 'a1',
  session_id: 'c1',
  entries,
  next_offset,
  path,
  root: '/work',
})
const content = (path: string, over: Partial<FileContent>): FileContent => ({
  agent_id: 'a1',
  session_id: 'c1',
  content: null,
  kind: 'text',
  mime: null,
  mtime: '2026-10-23T00:00:00Z',
  path,
  size: 10,
  ...over,
})

/** Directory listings by relative path; a function value is called per request. */
function serve(dirs: Record<string, FileListing | (() => FileListing)>) {
  api.listFiles.mockImplementation(async (_c: string, path: string) => {
    const d = dirs[path]
    if (!d) throw new ApiError(404, 'not_found', 'no such directory')
    return typeof d === 'function' ? d() : d
  })
}

const mount = (sessionId = 'c1') =>
  render(
    <ThemeProvider theme={theme}>
      <FilesPanel sessionId={sessionId} />
    </ThemeProvider>,
  )

/** A session event as the SSE stream delivers it. */
const emit = (type: string, data: Record<string, unknown>) =>
  act(async () => {
    stream.opened[stream.opened.length - 1].opts.onEvent({ id: 1, type, data }, { type, id: '1' })
  })

const calls = () => api.listFiles.mock.calls.map((c) => c.slice(0, 3))

/** The tabs of every session the tests use live in a module-level store: close them so no test sees another's. */
const SESSIONS = ['c1', 'c2', 'c3']
function closeAllTabs() {
  for (const sessionId of SESSIONS) {
    const { result, unmount } = renderHook(() => useFileTabs(sessionId))
    act(() => result.current.tabs.forEach((t) => result.current.close(t.path)))
    unmount()
  }
}

/** jsdom has no layout: give every element a box so react-resizable-panels mounts its panels. */
function stubGeometry() {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', NoopObserver)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 500, top: 0, left: 0, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
}

beforeEach(() => {
  api.listFiles.mockReset()
  api.readFile.mockReset()
  api.writeFile.mockReset()
  stream.opened.length = 0
  stream.close.mockReset()
  viewport.layout = 'desktop'
  stubGeometry()
  closeAllTabs()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The editor stand-in of the tab of `path`, from its (possibly hidden) tab panel. */
const inTree = (name: string) => within(screen.getByRole('tree')).getByText(name)
const panelOf = (path: string) => {
  const panel = screen.getAllByRole('tabpanel', { hidden: true }).find((p) => p.getAttribute('aria-label') === path)
  if (!panel) throw new Error(`no tab panel for ${path}`)
  return panel
}

describe('FilesPanel', () => {
  test('lazy_load_on_expand', async () => {
    serve({
      '': listing('', [entry('src', 'dir'), entry('.git', 'dir'), entry('.env'), entry('README.md')]),
      src: listing('src', [entry('main.py')]),
    })
    mount()
    expect(await screen.findByText('README.md')).toBeTruthy()
    // Everything is listed, dotfiles and .git included; only the root has been fetched.
    expect(screen.getByText('.git')).toBeTruthy()
    expect(screen.getByText('.env')).toBeTruthy()
    expect(calls()).toEqual([['c1', '']])
    expect(screen.queryByText('main.py')).toBeNull()

    fireEvent.click(screen.getByText('src'))
    expect(await screen.findByText('main.py')).toBeTruthy()
    expect(calls()).toEqual([['c1', ''], ['c1', 'src']])
    // The sibling folder was never expanded.
    expect(calls().some((c) => c[1] === '.git')).toBe(false)
  })

  test('more_row_pages', async () => {
    api.listFiles.mockImplementation(async (_c: string, _p: string, offset?: number) =>
      offset ? listing('', [entry('c.txt'), entry('d.txt')]) : listing('', [entry('a.txt'), entry('b.txt')], 2),
    )
    mount()
    const more = await screen.findByText('Load more')
    expect(screen.queryByText('c.txt')).toBeNull()
    fireEvent.click(more)
    expect(await screen.findByText('d.txt')).toBeTruthy()
    expect(calls()[1]).toEqual(['c1', '', 2])
    // The first page stays, the page is appended, and the more row is gone on the last page.
    expect(screen.getByText('a.txt')).toBeTruthy()
    expect(screen.getByText('c.txt')).toBeTruthy()
    expect(screen.queryByText('Load more')).toBeNull()
  })

  test('tab_kinds', async () => {
    serve({ '': listing('', [entry('a.txt'), entry('logo.png'), entry('huge.log')]) })
    api.readFile.mockImplementation(async (_c: string, path: string) => {
      if (path === 'a.txt') return content(path, { kind: 'text', content: 'hello world\nline two', size: 20, mime: 'text/plain' })
      if (path === 'logo.png') return content(path, { kind: 'binary', size: 2048, mime: 'image/png' })
      return content(path, { kind: 'too_large', size: 99999999 })
    })
    mount()
    fireEvent.click(await screen.findByText('a.txt'))
    const editor = await within(panelOf('a.txt')).findByTestId('file-editor')
    expect(editor.textContent).toContain('hello world\nline two')
    expect(api.readFile).toHaveBeenLastCalledWith('c1', 'a.txt')

    fireEvent.click(screen.getByText('logo.png'))
    const binary = await within(panelOf('logo.png')).findByTestId('file-preview-note')
    expect(binary.textContent).toContain('2048')
    expect(binary.textContent).toContain('image/png')
    expect(within(panelOf('logo.png')).queryByTestId('file-editor')).toBeNull()

    fireEvent.click(screen.getByText('huge.log'))
    await waitFor(() => expect(within(panelOf('huge.log')).getByTestId('file-preview-note').textContent).toContain('too large to preview'))
    expect(within(panelOf('huge.log')).getByTestId('file-preview-note').textContent).toContain('99999999')

    // Earlier tabs stay open and mounted beside the new one.
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['a.txt', 'logo.png', 'huge.log'])
    expect(within(panelOf('a.txt')).getByTestId('file-editor').textContent).toContain('hello world')
  })

  describe('split layout', () => {
    const open = async () => {
      serve({ '': listing('', [entry('a.txt')]) })
      api.readFile.mockResolvedValue(content('a.txt', { content: 'hello' }))
      const view = mount()
      fireEvent.click(await screen.findByText('a.txt'))
      await screen.findByTestId('file-editor')
      return view
    }
    const panels = () => screen.getByTestId('files-split').querySelectorAll<HTMLElement>('[data-panel]')

    test('tree left editor right', async () => {
      for (const [i, layout] of (['desktop', 'tablet'] as const).entries()) {
        viewport.layout = layout
        serve({ '': listing('', [entry('a.txt')]) })
        api.readFile.mockResolvedValue(content('a.txt', { content: 'hello' }))
        const view = mount(`c${i + 1}`)
        fireEvent.click(await screen.findByText('a.txt'))
        const editor = await screen.findByTestId('file-editor')
        const split = screen.getByTestId('files-split')
        expect(split.getAttribute('data-orientation'), layout).toBe('horizontal')
        const [first, second] = panels()
        expect(panels()).toHaveLength(2)
        expect(first.contains(screen.getByRole('tree')), layout).toBe(true)
        expect(second.contains(editor), layout).toBe(true)
        expect(first.contains(editor), layout).toBe(false)
        // The tree stays rendered while a tab is open.
        expect(inTree('a.txt')).toBeTruthy()
        const separator = split.querySelector<HTMLElement>('[role="separator"]')
        expect(separator?.style.flexBasis, layout).toMatch(/^\d+px$/)
        view.unmount()
      }
    })

    test('phone stacks', async () => {
      viewport.layout = 'phone'
      await open()
      expect(screen.getByTestId('files-split').getAttribute('data-orientation')).toBe('vertical')
      const [above, below] = panels()
      expect(above.contains(screen.getByRole('tree'))).toBe(true)
      expect(below.contains(screen.getByTestId('file-editor'))).toBe(true)
      // Both are rendered, the tree is not hidden behind the editor.
      expect(screen.getByRole('tree').closest('[hidden]')).toBeNull()
      expect(screen.getByRole('tabpanel', { name: 'a.txt' })).toBeTruthy()
    })

    test('tree opens tabs', async () => {
      serve({ '': listing('', [entry('a.txt'), entry('b.txt')]) })
      api.readFile.mockImplementation(async (_c: string, path: string) => content(path, { content: `text of ${path}` }))
      mount()
      expect(await screen.findByText('Open a file from the tree')).toBeTruthy()
      const selected = () =>
        screen
          .getAllByRole('treeitem')
          .filter((i) => i.getAttribute('aria-selected') === 'true')
          .map((i) => i.textContent)

      fireEvent.click(await screen.findByText('a.txt'))
      await within(panelOf('a.txt')).findByTestId('file-editor')
      fireEvent.click(screen.getByText('b.txt'))
      await within(panelOf('b.txt')).findByTestId('file-editor')
      expect(screen.queryByText('Open a file from the tree')).toBeNull()
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['a.txt', 'b.txt'])
      expect(screen.getByRole('tab', { name: /b\.txt/ }).getAttribute('aria-selected')).toBe('true')
      expect(selected()).toEqual(['b.txt'])
      expect(api.readFile).toHaveBeenCalledTimes(2)

      // An open file focuses its tab without another read, and the selection follows.
      fireEvent.click(inTree('a.txt'))
      await waitFor(() => expect(screen.getByRole('tab', { name: /a\.txt/ }).getAttribute('aria-selected')).toBe('true'))
      expect(selected()).toEqual(['a.txt'])
      expect(api.readFile).toHaveBeenCalledTimes(2)

      // Selecting a tab moves the tree selection; closing the last tabs brings the note back.
      fireEvent.click(screen.getByRole('tab', { name: /b\.txt/ }))
      await waitFor(() => expect(selected()).toEqual(['b.txt']))
      fireEvent.click(screen.getByRole('button', { name: 'Close b.txt' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close a.txt' }))
      expect(await screen.findByText('Open a file from the tree')).toBeTruthy()
      expect(selected()).toEqual([])
    })
  })

  describe('event_driven_refresh', () => {
    const tree = () => {
      let n = 0
      serve({
        '': () => listing('', n++ ? [entry('src', 'dir'), entry('root_new.txt')] : [entry('src', 'dir'), entry('lib', 'dir')]),
        src: listing('src', [entry('main.py')]),
        lib: listing('lib', [entry('x.py')]),
      })
    }

    test('event_driven_refresh opens a live-tail stream for tool_call and tool_result', async () => {
      tree()
      mount()
      await screen.findByText('src')
      expect(stream.opened).toHaveLength(1)
      expect(stream.opened[0].url).toBe('/api/v1/sessions/c1/events/stream')
      expect([...(stream.opened[0].opts.eventNames ?? [])].sort()).toEqual(['tool_call', 'tool_result'])
      expect(stream.opened[0].opts.afterId).toBeUndefined()
    })

    /** A write tool's call followed by its result, as the stream delivers them (the call fires before the tool runs). */
    let seq = 0
    const call = async (name: string, input: Record<string, unknown>) => {
      const id = `u${++seq}`
      await emit('tool_call', { tool_use_id: id, name, tool_input: input })
      return id
    }
    const result = (id: string) => emit('tool_result', { tool_use_id: id, response: 'ok', is_error: false })

    test('event_driven_refresh Write and Edit refresh the loaded parent directory on the result only', async () => {
      let version = 0
      serve({
        '': listing('', [entry('src', 'dir'), entry('lib', 'dir')]),
        src: () => listing('src', version++ ? [entry('main.py'), entry('new.py')] : [entry('main.py')]),
        lib: listing('lib', [entry('x.py')]),
      })
      mount()
      fireEvent.click(await screen.findByText('src'))
      await screen.findByText('main.py')
      const before = calls().length

      const id = await call('Write', { file_path: '/work/src/new.py' })
      // The call fires before the tool runs: nothing is refreshed yet.
      expect(calls().length).toBe(before)
      await result(id)
      expect(await screen.findByText('new.py')).toBeTruthy()
      expect(calls().slice(before)).toEqual([['c1', 'src']])

      // Outside the root, wrong tool, a missing path and an unknown result id are all ignored.
      await result(await call('Write', { file_path: '/elsewhere/src/z.py' }))
      await result(await call('Write', { file_path: '/workshop/src/z.py' }))
      await result(await call('Read', { file_path: '/work/src/main.py' }))
      await result(await call('Edit', {}))
      await result('never-called')
      expect(calls().length).toBe(before + 1)

      // Edit and NotebookEdit work, also through the alternate accessors; a file in the root refreshes the root.
      const alt = `u${++seq}`
      await emit('tool_call', { tool_use_id: alt, tool_name: 'Edit', input: { file_path: '/work/root.txt' } })
      await result(alt)
      await result(await call('NotebookEdit', { file_path: '/work/src/n.ipynb' }))
      expect(calls().slice(before + 1)).toEqual([['c1', ''], ['c1', 'src']])
    })

    test('event_driven_refresh a Write into a new directory refreshes the nearest loaded ancestor so the new directory appears', async () => {
      let version = 0
      serve({ '': () => listing('', version++ ? [entry('src', 'dir'), entry('fresh', 'dir')] : [entry('src', 'dir')]), src: listing('src', []) })
      mount()
      await screen.findByText('src')
      const before = calls().length
      await result(await call('Write', { file_path: '/work/fresh/deep/a.py' }))
      expect(await screen.findByText('fresh')).toBeTruthy()
      expect(calls().slice(before)).toEqual([['c1', '']])
    })

    test('event_driven_refresh a NotebookEdit with notebook_path refreshes its parent directory', async () => {
      let version = 0
      serve({ '': listing('', [entry('src', 'dir')]), src: () => listing('src', version++ ? [entry('a.ipynb'), entry('b.ipynb')] : [entry('a.ipynb')]) })
      mount()
      fireEvent.click(await screen.findByText('src'))
      await screen.findByText('a.ipynb')
      const before = calls().length
      await result(await call('NotebookEdit', { notebook_path: '/work/src/a.ipynb' }))
      expect(await screen.findByText('b.ipynb')).toBeTruthy()
      expect(calls().slice(before)).toEqual([['c1', 'src']])
    })

    test('event_driven_refresh a written file open in the preview is refetched on the result', async () => {
      serve({ '': listing('', [entry('a.txt'), entry('b.txt')]) })
      let version = 0
      api.readFile.mockImplementation(async (_c: string, path: string) => content(path, { content: `v${version++}` }))
      mount()
      fireEvent.click(await screen.findByText('a.txt'))
      await screen.findByText('v0')
      const id = await call('Edit', { file_path: '/work/a.txt' })
      expect(api.readFile).toHaveBeenCalledTimes(1)
      await result(id)
      expect(await screen.findByText('v1')).toBeTruthy()
      // Another file is not the open one.
      await result(await call('Write', { file_path: '/work/b.txt' }))
      expect(api.readFile).toHaveBeenCalledTimes(2)
    })

    test('written event refresh', async () => {
      serve({ '': listing('', [entry('a.txt'), entry('b.txt')]) })
      let version = 0
      api.readFile.mockImplementation(async (_c: string, path: string) => content(path, { content: `${path} v${version++}` }))
      const readsOf = (path: string) => api.readFile.mock.calls.filter((c) => c[1] === path).length
      mount()
      fireEvent.click(await screen.findByText('a.txt'))
      await within(panelOf('a.txt')).findByText('a.txt v0')
      fireEvent.click(screen.getByText('b.txt'))
      await within(panelOf('b.txt')).findByText('b.txt v1')
      fireEvent.click(within(panelOf('b.txt')).getByRole('button', { name: 'RW' }))
      fireEvent.click(within(panelOf('b.txt')).getByRole('button', { name: 'stand-in change' }))
      await within(panelOf('b.txt')).findByText('changed text')

      // The clean tab is refetched on the result only, not on the call.
      const first = await call('Write', { file_path: '/work/a.txt' })
      expect(readsOf('a.txt')).toBe(1)
      await result(first)
      expect(await within(panelOf('a.txt')).findByText('a.txt v2')).toBeTruthy()
      // The dirty tab keeps its text and is marked changed on disk.
      await result(await call('Edit', { file_path: '/work/b.txt' }))
      expect(readsOf('b.txt')).toBe(1)
      expect(within(panelOf('b.txt')).getByText('changed text')).toBeTruthy()
      expect(await within(panelOf('b.txt')).findByText('The file changed on disk while you were editing.')).toBeTruthy()
    })

    test('event_driven_refresh Bash results refresh expanded directories at most once a second', async () => {
      tree()
      mount()
      fireEvent.click(await screen.findByText('src'))
      await screen.findByText('main.py')
      const before = calls().length
      vi.useFakeTimers()

      await emit('tool_result', { tool_name: 'Bash' })
      await act(async () => {})
      // The root and the expanded src are refreshed; the never-expanded lib is not.
      expect(calls().slice(before).map((c) => c[1]).sort()).toEqual(['', 'src'])

      await emit('tool_result', { tool_name: 'Bash' })
      await emit('tool_result', { tool_name: 'Bash' })
      await emit('tool_result', { tool_name: 'Read' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900)
      })
      expect(calls().length).toBe(before + 2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      // The burst collapsed into one trailing pass.
      expect(calls().length).toBe(before + 4)
    })
  })

  describe('auto poll', () => {
    const setVisibility = (v: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    const tick = (ms: number) =>
      act(async () => {
        vi.advanceTimersByTime(ms)
        await Promise.resolve()
        await new Promise((r) => setTimeout(r, 0))
      })
    afterEach(() => setVisibility('visible'))
    // Only the interval is faked, so the Testing Library waits keep working on real timers.
    beforeEach(() => void vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }))

    test('no refresh button', async () => {
      serve({ '': listing('', [entry('a.txt')]) })
      mount()
      await screen.findByText('a.txt')
      expect(screen.queryByRole('button', { name: 'Refresh files' })).toBeNull()
      expect(screen.queryByLabelText('Refresh files')).toBeNull()
    })

    test('polls while visible', async () => {
      let version = 0
      serve({ '': () => listing('', version ? [entry('a.txt'), entry('new.txt')] : [entry('a.txt')]) })
      mount()
      await screen.findByText('a.txt')
      version = 1
      await tick(3100)
      expect(screen.getByText('new.txt')).toBeTruthy()
      // An idle poll lists again but changes nothing.
      const n = calls().length
      await tick(3000)
      expect(calls().length).toBe(n + 1)
    })

    test('hidden tab makes no listing calls and one pass runs on return', async () => {
      serve({ '': listing('', [entry('a.txt')]) })
      mount()
      await screen.findByText('a.txt')
      act(() => setVisibility('hidden'))
      const n = calls().length
      await tick(10000)
      expect(calls().length).toBe(n)
      act(() => setVisibility('visible'))
      await tick(0)
      expect(calls().length).toBe(n + 1)
    })

    test('unmounted panel runs no timer', async () => {
      serve({ '': listing('', [entry('a.txt')]) })
      const view = mount()
      await screen.findByText('a.txt')
      view.unmount()
      const n = calls().length
      await tick(10000)
      expect(calls().length).toBe(n)
    })

    test('a stream open runs one pass', async () => {
      serve({ '': listing('', [entry('a.txt')]) })
      mount()
      await screen.findByText('a.txt')
      const n = calls().length
      await act(async () => stream.opened[stream.opened.length - 1].opts.onOpen?.())
      expect(calls().length).toBe(n + 1)
    })

    test('recovers from a 409 root without a click', async () => {
      let up = false
      api.listFiles.mockImplementation(async () => {
        if (!up) throw new ApiError(409, 'agent_not_ready', 'no agent of the session is ready')
        return listing('', [entry('fresh.txt')])
      })
      mount()
      expect((await screen.findByRole('alert')).textContent).toContain('agent_not_ready')
      up = true
      await tick(3100)
      expect(screen.getByText('fresh.txt')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    test('recovers from a missing root without a click', async () => {
      let up = false
      api.listFiles.mockImplementation(async () => {
        if (!up) throw new ApiError(404, 'not_found', 'workdir does not exist')
        return listing('', [entry('fresh.txt')])
      })
      mount()
      await screen.findByText('workdir not created yet')
      up = true
      await tick(3100)
      expect(screen.getByText('fresh.txt')).toBeTruthy()
      expect(screen.queryByText('workdir not created yet')).toBeNull()
    })

    test('preview refetch when the entry mtime or size changes', async () => {
      let mtime = '2026-10-23T00:00:00Z'
      let size = 10
      serve({ '': () => listing('', [{ ...entry('a.txt'), mtime, size }, entry('b.txt')]) })
      let version = 0
      api.readFile.mockImplementation(async (_c: string, path: string) => content(path, { content: `v${version++}` }))
      mount()
      fireEvent.click(await screen.findByText('a.txt'))
      await screen.findByText('v0')
      // Nothing changed: no refetch.
      await tick(3100)
      expect(api.readFile).toHaveBeenCalledTimes(1)
      mtime = '2026-10-24T00:00:00Z'
      await tick(3100)
      expect(api.readFile).toHaveBeenCalledTimes(2)
      expect(screen.getByText('v1')).toBeTruthy()
      size = 99
      await tick(3100)
      expect(api.readFile).toHaveBeenCalledTimes(3)
    })

    test('live refresh keeps edits', async () => {
      let mtime = '2026-10-23T00:00:00Z'
      serve({ '': () => listing('', [{ ...entry('a.txt'), mtime }, { ...entry('b.txt'), mtime }]) })
      api.readFile.mockImplementation(async (_c: string, path: string) => content(path, { content: `${path} v${api.readFile.mock.calls.length}` }))
      const readsOf = (path: string) => api.readFile.mock.calls.filter((c) => c[1] === path).length
      mount()
      fireEvent.click(await screen.findByText('a.txt'))
      await within(panelOf('a.txt')).findByText('a.txt v1')
      fireEvent.click(screen.getByText('b.txt'))
      await within(panelOf('b.txt')).findByText('b.txt v2')
      // b.txt goes RW and gets an unsaved edit.
      fireEvent.click(within(panelOf('b.txt')).getByRole('button', { name: 'RW' }))
      fireEvent.click(within(panelOf('b.txt')).getByRole('button', { name: 'stand-in change' }))
      await within(panelOf('b.txt')).findByText('changed text')

      mtime = '2026-10-24T00:00:00Z'
      await tick(3100)
      // The clean RO tab is refetched.
      await within(panelOf('a.txt')).findByText(/a\.txt v\d/)
      await waitFor(() => expect(readsOf('a.txt')).toBe(2))
      // The dirty RW tab is not: its text stays and it says the file changed on disk.
      expect(readsOf('b.txt')).toBe(1)
      expect(within(panelOf('b.txt')).getByText('changed text')).toBeTruthy()
      expect(within(panelOf('b.txt')).getByText('The file changed on disk while you were editing.')).toBeTruthy()
      expect(within(panelOf('a.txt')).queryByText('The file changed on disk while you were editing.')).toBeNull()
    })
  })

  test('symlink_previews_and_escape_error', async () => {
    serve({ '': listing('', [entry('link.txt', 'symlink'), entry('escape', 'symlink')]) })
    api.readFile.mockImplementation(async (_c: string, path: string) => {
      if (path === 'escape') throw new ApiError(400, 'invalid_path', 'path escapes the workdir')
      return content(path, { kind: 'text', content: 'target text' })
    })
    mount()
    fireEvent.click(await screen.findByText('link.txt'))
    expect((await within(panelOf('link.txt')).findByTestId('file-editor')).textContent).toContain('target text')
    expect(api.readFile).toHaveBeenCalledWith('c1', 'link.txt')
    // A symlink is a leaf: it is never listed as a directory.
    expect(calls()).toEqual([['c1', '']])

    fireEvent.click(screen.getByText('escape'))
    const err = await within(panelOf('escape')).findByTestId('file-preview-error')
    expect(err.textContent).toContain('invalid_path')
    expect(err.textContent).toContain('escapes the workdir')
    // The link's tab stays open beside the error tab.
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['link.txt', 'escape'])
    expect(within(panelOf('link.txt')).getByTestId('file-editor').textContent).toContain('target text')
  })

  test('download_icon_only_on_file_rows', async () => {
    serve({
      '': listing('', [
        entry('src', 'dir'),
        entry('a.txt'),
        entry('sock', 'other'),
        symlink('to-file', 'file'),
        symlink('to-dir', 'dir'),
        symlink('to-other', 'other'),
        symlink('dangling', null),
      ]),
    })
    mount()
    await screen.findByText('a.txt')
    const links = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    expect(links).toEqual(['Download a.txt', 'Download to-file'])
    for (const [name, path] of [['a.txt', 'a.txt'], ['to-file', 'to-file']]) {
      const link = screen.getByRole('link', { name: `Download ${name}` })
      expect(link.getAttribute('href')).toBe(api.fileDownloadUrl('c1', path))
      expect(link.getAttribute('download')).toBe(name)
      expect(link.querySelector('[data-testid="FileDownloadOutlinedIcon"]')).not.toBeNull()
    }
    for (const name of ['src', 'sock', 'to-dir', 'to-other', 'dangling']) {
      expect(screen.queryByRole('link', { name: `Download ${name}` })).toBeNull()
    }
  })

  test('download_icon_in_nested_directory_uses_the_joined_path', async () => {
    serve({ '': listing('', [entry('src', 'dir')]), src: listing('src', [entry('main.py')]) })
    mount()
    fireEvent.click(await screen.findByText('src'))
    const link = await screen.findByRole('link', { name: 'Download main.py' })
    expect(link.getAttribute('href')).toBe(api.fileDownloadUrl('c1', 'src/main.py'))
    expect(link.getAttribute('download')).toBe('main.py')
  })

  test('download_click_does_not_open_preview', async () => {
    serve({ '': listing('', [entry('a.txt')]) })
    api.readFile.mockResolvedValue(content('a.txt', { content: 'hello' }))
    mount()
    const link = await screen.findByRole('link', { name: 'Download a.txt' })
    // jsdom does not implement navigation: the browser default is cancelled before React sees the click.
    link.addEventListener('click', (e) => e.preventDefault())
    const item = screen.getByRole('treeitem')
    fireEvent.click(link)
    await act(async () => {})
    expect(api.readFile).not.toHaveBeenCalled()
    expect(screen.queryByTestId('file-editor')).toBeNull()
    expect(screen.queryByText('loading')).toBeNull()
    expect(item.getAttribute('aria-selected')).not.toBe('true')
    // A click on the name still opens the preview.
    fireEvent.click(screen.getByText('a.txt'))
    expect((await screen.findByTestId('file-editor')).textContent).toContain('hello')
    expect(api.readFile).toHaveBeenCalledTimes(1)
  })

  test('download_icon_right_aligned', async () => {
    serve({ '': listing('', [entry('a.txt')]) })
    mount()
    const link = await screen.findByRole('link', { name: 'Download a.txt' })
    const row = link.parentElement as HTMLElement
    expect(row.lastElementChild).toBe(link)
    const name = screen.getByText('a.txt')
    expect(row.contains(name)).toBe(true)
    expect(getComputedStyle(name).flexGrow).toBe('1')
  })

  test('other_entries_type_only', async () => {
    serve({ '': listing('', [entry('sock', 'other')]) })
    mount()
    fireEvent.click(await screen.findByText('sock'))
    const note = await screen.findByTestId('file-preview-note')
    expect(note.textContent).toContain('other')
    expect(api.readFile).not.toHaveBeenCalled()
    expect(calls()).toEqual([['c1', '']])
  })

  test('missing_root_empty_tree', async () => {
    api.listFiles.mockRejectedValue(new ApiError(404, 'not_found', 'workdir does not exist'))
    mount()
    expect(await screen.findByText('workdir not created yet')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryAllByRole('treeitem')).toHaveLength(0)
  })

  test('event_stream_closes_on_unmount', async () => {
    serve({ '': listing('', [entry('a.txt')]) })
    const view = mount()
    await screen.findByText('a.txt')
    expect(stream.opened).toHaveLength(1)
    expect(stream.close).not.toHaveBeenCalled()

    // A session change swaps the subscription.
    view.rerender(
      <ThemeProvider theme={theme}>
        <FilesPanel sessionId="c2" />
      </ThemeProvider>,
    )
    await waitFor(() => expect(stream.opened).toHaveLength(2))
    expect(stream.opened[1].url).toBe('/api/v1/sessions/c2/events/stream')
    expect(stream.close).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(stream.close).toHaveBeenCalledTimes(2)
  })

  test('preview_dropped_on_session_change', async () => {
    serve({ '': listing('', [entry('a.txt')]) })
    api.readFile.mockResolvedValue(content('a.txt', { content: 'one' }))
    const view = mount()
    fireEvent.click(await screen.findByText('a.txt'))
    await screen.findByTestId('file-editor')
    const as = (sessionId: string) => (
      <ThemeProvider theme={theme}>
        <FilesPanel sessionId={sessionId} />
      </ThemeProvider>
    )
    view.rerender(as('c2'))
    await waitFor(() => expect(screen.queryByTestId('file-editor')).toBeNull())
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(await screen.findByText('Open a file from the tree')).toBeTruthy()
    // Returning to the first session shows its tab again, without a read.
    view.rerender(as('c1'))
    expect((await screen.findByTestId('file-editor')).textContent).toContain('one')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['a.txt'])
    expect(api.readFile).toHaveBeenCalledTimes(1)
  })
})

describe('useFileTree', () => {
  test('an unchanged listing refresh keeps the tree state object', async () => {
    serve({ '': listing('', [entry('a.txt')]) })
    const { result } = renderHook(() => useFileTree('c1'))
    await waitFor(() => expect(result.current.state.dirs[''] && !result.current.state.dirs[''].loading).toBe(true))
    const before = result.current.state
    let renders = 0
    renderHook(() => void renders++)
    await act(async () => {
      result.current.refresh('')
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(api.listFiles).toHaveBeenCalledTimes(2)
    expect(result.current.state).toBe(before)
    // A changed listing does commit.
    serve({ '': listing('', [entry('a.txt'), entry('b.txt')]) })
    await act(async () => {
      result.current.refresh('')
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(result.current.state).not.toBe(before)
    expect(result.current.state.dirs[''].entries).toHaveLength(2)
  })

  test('an unchanged listing refresh of a multi-page directory causes no state change', async () => {
    api.listFiles.mockImplementation(async (_c: string, _p: string, offset?: number) =>
      offset === undefined ? listing('', [entry('a.txt')], 1) : listing('', [entry('b.txt')]),
    )
    const { result } = renderHook(() => useFileTree('c1'))
    await waitFor(() => expect(result.current.state.dirs['']?.loading).toBe(false))
    act(() => result.current.loadMore(''))
    await waitFor(() => expect(result.current.state.dirs[''].entries).toHaveLength(2))
    const before = result.current.state
    await act(async () => {
      result.current.refresh('')
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(api.listFiles).toHaveBeenCalledTimes(4)
    expect(result.current.state).toBe(before)
  })

  test('pollExpanded skips a directory whose load is in flight', async () => {
    let release: (l: FileListing) => void = () => {}
    api.listFiles.mockImplementation(async (_c: string, path: string) => {
      if (path === 'src') return new Promise<FileListing>((r) => (release = r))
      return listing('', [entry('src', 'dir')])
    })
    const { result } = renderHook(() => useFileTree('c1'))
    await waitFor(() => expect(result.current.state.dirs['']?.loading).toBe(false))
    act(() => result.current.expand('src'))
    const before = api.listFiles.mock.calls.length
    act(() => result.current.pollExpanded())
    expect(api.listFiles.mock.calls.slice(before).map((c) => c[1])).toEqual([''])
    await act(async () => release(listing('src', [entry('x.py')])))
    await waitFor(() => expect(result.current.state.dirs.src?.entries).toHaveLength(1))
  })

  test('pollExpanded retries a root in error or missing state', async () => {
    let fail: ApiError | null = new ApiError(409, 'agent_not_ready', 'not ready')
    api.listFiles.mockImplementation(async () => {
      if (fail) throw fail
      return listing('', [entry('a.txt')])
    })
    const { result } = renderHook(() => useFileTree('c1'))
    await waitFor(() => expect(result.current.state.dirs['']?.error).toContain('agent_not_ready'))
    fail = new ApiError(404, 'not_found', 'gone')
    await act(async () => result.current.pollExpanded())
    await waitFor(() => expect(result.current.state.missing).toBe(true))
    fail = null
    await act(async () => result.current.pollExpanded())
    await waitFor(() => expect(result.current.state.dirs[''].entries).toHaveLength(1))
    expect(result.current.state.missing).toBe(false)
  })
})
