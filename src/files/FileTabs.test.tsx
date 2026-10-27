// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { CodeEditorProps } from '../editor/CodeEditor'
import { theme } from '../theme'
import { FileTabs } from './FileTabs'
import type { FileTab, FileTabs as FileTabsApi } from './useFileTabs'

// CodeMirror does not run under jsdom: a stand-in that takes the real props, shows the doc and the mode, and calls back.
vi.mock('../editor/CodeEditor', () => ({
  default: function CodeEditorStandIn(props: CodeEditorProps) {
    return (
      <div data-testid="file-editor" data-readonly={String(props.readOnly)} data-path={props.path} data-doc-version={props.docVersion}>
        <span>{props.doc}</span>
        <button type="button" onClick={() => props.onChange('changed text')}>
          stand-in change
        </button>
        <button type="button" onClick={() => props.onSave()}>
          stand-in save
        </button>
      </div>
    )
  },
}))

const SESSION = '00000000-0000-0000-0000-000000000001'
const AGENT = '00000000-0000-0000-0000-000000000002'
const MTIME = '2026-10-27T10:00:00.000Z'

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function textTab(path: string, over: Partial<FileTab> = {}): FileTab {
  return {
    path,
    name: nameOf(path),
    kind: 'text',
    file: { session_id: SESSION, agent_id: AGENT, path, kind: 'text', mime: 'text/plain', size: 5, mtime: MTIME, content: 'hello' },
    error: null,
    mode: 'ro',
    baseline: { mtime: MTIME, size: 5 },
    doc: 'hello',
    docVersion: 1,
    dirty: false,
    saving: false,
    saveError: null,
    conflict: false,
    changedOnDisk: false,
    ...over,
  }
}

function noteTab(path: string, kind: FileTab['kind'], over: Partial<FileTab> = {}): FileTab {
  return textTab(path, { kind, file: null, baseline: null, doc: '', ...over })
}

function api(tabs: FileTab[], active: string | null = tabs[0]?.path ?? null): FileTabsApi {
  return {
    tabs,
    active,
    open: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    setMode: vi.fn(),
    edit: vi.fn(),
    save: vi.fn(),
    overwrite: vi.fn(),
    reload: vi.fn(),
    keepEditing: vi.fn(),
    observe: vi.fn(),
    written: vi.fn(),
  }
}

const show = (tabs: FileTabsApi) =>
  render(
    <ThemeProvider theme={theme}>
      <FileTabs tabs={tabs} />
    </ThemeProvider>,
  )

/** The panel of one tab, visible or not (a hidden element has no computed accessible name, so match the label itself). */
const panelOf = (path: string) => {
  const panel = screen.getAllByRole('tabpanel', { hidden: true }).find((p) => p.getAttribute('aria-label') === path)
  if (!panel) throw new Error(`no tab panel for ${path}`)
  return panel
}
const tabNamed = (name: string) => screen.getAllByRole('tab').find((t) => t.textContent?.startsWith(name)) as HTMLElement

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FileTabs', () => {
  test('terminal style tabs', async () => {
    // jsdom has no layout: an observer that reports the edge tabs out of view, as on an overflowing strip
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: false }])
        }
        disconnect() {}
      },
    )
    const tabs = api([textTab('src/app/main.py'), noteTab('img/logo.png', 'binary'), noteTab('run/fifo', 'other')], 'src/app/main.py')
    const { container } = show(tabs)

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(container.querySelector('.MuiTabs-scrollableX')).not.toBeNull()
    expect(container.querySelectorAll('.MuiTabs-scrollButtons')).toHaveLength(2)

    const all = screen.getAllByRole('tab')
    expect(all.map((t) => t.textContent)).toEqual(['main.py', 'logo.png', 'fifo'])
    for (const [i, name] of ['main.py', 'logo.png', 'fifo'].entries()) {
      expect(within(all[i]).getByRole('button', { name: `Close ${name}` })).toBeTruthy()
    }
    expect(all[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.click(tabNamed('logo.png'))
    expect(tabs.focus).toHaveBeenCalledWith('img/logo.png')

    // every panel stays mounted, only the active one is visible
    const panels = screen.getAllByRole('tabpanel', { hidden: true })
    expect(panels).toHaveLength(3)
    expect(panels.filter((p) => !p.hidden)).toEqual([panelOf('src/app/main.py')])
    expect(panelOf('img/logo.png').hidden).toBe(true)
    expect(panelOf('run/fifo').hidden).toBe(true)
    expect(await within(panelOf('src/app/main.py')).findByTestId('file-editor')).toBeTruthy()
    expect(within(panelOf('img/logo.png')).getByTestId('file-preview-note')).toBeTruthy()
  })

  test('dirty close confirms', async () => {
    const tabs = api([textTab('a/clean.py'), textTab('b/dirty.py', { mode: 'rw', dirty: true }), textTab('c/other.py')], 'c/other.py')
    show(tabs)

    // a clean tab closes at once, and the close click does not activate it
    fireEvent.click(screen.getByRole('button', { name: 'Close clean.py' }))
    expect(tabs.close).toHaveBeenCalledWith('a/clean.py')
    expect(tabs.focus).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()

    // a dirty tab asks first: Cancel keeps it
    fireEvent.click(screen.getByRole('button', { name: 'Close dirty.py' }))
    expect(tabs.focus).not.toHaveBeenCalled()
    expect(tabs.close).toHaveBeenCalledTimes(1)
    const dialog = screen.getByRole('dialog', { name: 'Discard unsaved changes to dirty.py?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(tabs.close).toHaveBeenCalledTimes(1)
    // the page stays aria-hidden until the dialog's exit transition ends
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // and Discard closes it
    fireEvent.click(screen.getByRole('button', { name: 'Close dirty.py' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes to dirty.py?' })).getByRole('button', { name: 'Discard' }))
    expect(tabs.close).toHaveBeenCalledTimes(2)
    expect(tabs.close).toHaveBeenLastCalledWith('b/dirty.py')
    expect(tabs.focus).not.toHaveBeenCalled()
  })

  test('dirty mark', () => {
    show(api([textTab('x/clean.yaml'), textTab('x/dirty.yaml', { mode: 'rw', dirty: true })]))
    const clean = tabNamed('clean.yaml')
    const dirty = tabNamed('dirty.yaml')
    expect(dirty.textContent).toBe('dirty.yaml *')
    expect(dirty.getAttribute('data-dirty')).toBe('true')
    expect(clean.textContent).toBe('clean.yaml')
    expect(clean.textContent?.endsWith(' *')).toBe(false)
    expect(clean.hasAttribute('data-dirty')).toBe(false)
  })

  test('mode toggle and save button', async () => {
    const path = 'deploy/values.yaml'
    const saveButton = () => within(panelOf(path)).getByRole('button', { name: 'Save' }) as HTMLButtonElement
    const modeButton = (label: 'RO' | 'RW') => within(within(panelOf(path)).getByRole('group', { name: 'Editor mode' })).getByRole('button', { name: label }) as HTMLButtonElement

    // RO by default: the full path, RO selected, the editor read-only, Save disabled
    let tabs = api([textTab(path)])
    show(tabs)
    expect(within(panelOf(path)).getByTestId('file-tab-path').textContent).toBe(path)
    expect(modeButton('RO').getAttribute('aria-pressed')).toBe('true')
    expect(modeButton('RW').getAttribute('aria-pressed')).toBe('false')
    expect((await within(panelOf(path)).findByTestId('file-editor')).getAttribute('data-readonly')).toBe('true')
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(modeButton('RW'))
    expect(tabs.setMode).toHaveBeenCalledWith(path, 'rw')
    cleanup()

    // RW without changes: editable, Save disabled, RO selectable; an editor change reaches edit
    tabs = api([textTab(path, { mode: 'rw' })])
    show(tabs)
    expect(modeButton('RW').getAttribute('aria-pressed')).toBe('true')
    expect(modeButton('RO').disabled).toBe(false)
    expect((await within(panelOf(path)).findByTestId('file-editor')).getAttribute('data-readonly')).toBe('false')
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(within(panelOf(path)).getByRole('button', { name: 'stand-in change' }))
    expect(tabs.edit).toHaveBeenCalledWith(path, 'changed text')
    fireEvent.click(modeButton('RO'))
    expect(tabs.setMode).toHaveBeenCalledWith(path, 'ro')
    cleanup()

    // RW with changes: RO disabled, Save enabled and saving
    tabs = api([textTab(path, { mode: 'rw', dirty: true })])
    show(tabs)
    expect(modeButton('RO').disabled).toBe(true)
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    expect(tabs.save).toHaveBeenCalledWith(path)
    cleanup()

    // a save running: Save disabled
    tabs = api([textTab(path, { mode: 'rw', dirty: true, saving: true })])
    show(tabs)
    expect(saveButton().disabled).toBe(true)
    cleanup()

    // RO with changes (the hook never lets this happen, the button still refuses): Save disabled
    tabs = api([textTab(path, { mode: 'ro', dirty: true })])
    show(tabs)
    expect(saveButton().disabled).toBe(true)
  })

  test('keyboard save', async () => {
    const path = 'infra/main.tf'
    const cases: [Partial<FileTab>, boolean][] = [
      [{ mode: 'ro' }, false],
      [{ mode: 'ro', dirty: true }, false],
      [{ mode: 'rw' }, false],
      [{ mode: 'rw', dirty: true, saving: true }, false],
      [{ mode: 'rw', dirty: true }, true],
    ]
    for (const [over, saves] of cases) {
      const tabs = api([textTab(path, over)])
      show(tabs)
      await within(panelOf(path)).findByTestId('file-editor')
      fireEvent.click(within(panelOf(path)).getByRole('button', { name: 'stand-in save' }))
      if (saves) expect(tabs.save, JSON.stringify(over)).toHaveBeenCalledWith(path)
      else expect(tabs.save, JSON.stringify(over)).not.toHaveBeenCalled()
      cleanup()
    }
  })

  test('notices', () => {
    const path = 'pyproject.toml'
    const alertWith = (text: string) => within(panelOf(path)).getAllByRole('alert').find((a) => a.textContent?.includes(text)) as HTMLElement

    // a save answered 409: Reload or Overwrite
    let tabs = api([textTab(path, { mode: 'rw', dirty: true, conflict: true })])
    show(tabs)
    let alert = alertWith('changed on disk')
    expect(alert).toBeTruthy()
    expect(within(alert).queryByRole('button', { name: 'Keep editing' })).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }))
    expect(tabs.reload).toHaveBeenCalledWith(path)
    fireEvent.click(within(alert).getByRole('button', { name: 'Overwrite' }))
    expect(tabs.overwrite).toHaveBeenCalledWith(path)
    cleanup()

    // the file changed on disk while dirty: Reload or Keep editing
    tabs = api([textTab(path, { mode: 'rw', dirty: true, changedOnDisk: true })])
    show(tabs)
    alert = alertWith('changed on disk')
    expect(alert).toBeTruthy()
    expect(within(alert).queryByRole('button', { name: 'Overwrite' })).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }))
    expect(tabs.reload).toHaveBeenCalledWith(path)
    fireEvent.click(within(alert).getByRole('button', { name: 'Keep editing' }))
    expect(tabs.keepEditing).toHaveBeenCalledWith(path)
    cleanup()

    // a failed save shows its text inline
    show(api([textTab(path, { mode: 'rw', dirty: true, saveError: 'too_large: file exceeds 1048576 bytes' })]))
    expect(alertWith('too_large: file exceeds 1048576 bytes')).toBeTruthy()
    cleanup()

    // a clean tab has no notice
    show(api([textTab(path)]))
    expect(within(panelOf(path)).queryAllByRole('alert')).toEqual([])
  })

  test('non-text tabs', async () => {
    const cases: [FileTab, string, string][] = [
      [
        noteTab('img/logo.png', 'binary', { file: { session_id: SESSION, agent_id: AGENT, path: 'img/logo.png', kind: 'binary', mime: 'image/png', size: 2048, mtime: MTIME, content: null } }),
        'file-preview-note',
        'Binary file, 2048 bytes, image/png',
      ],
      [
        noteTab('blob/data', 'binary', { file: { session_id: SESSION, agent_id: AGENT, path: 'blob/data', kind: 'binary', mime: null, size: 7, mtime: MTIME, content: null } }),
        'file-preview-note',
        'Binary file, 7 bytes, unknown type',
      ],
      [
        noteTab('logs/big.log', 'too_large', { file: { session_id: SESSION, agent_id: AGENT, path: 'logs/big.log', kind: 'too_large', mime: 'text/plain', size: 9000000, mtime: MTIME, content: null } }),
        'file-preview-note',
        '9000000 bytes, too large to preview',
      ],
      [noteTab('run/fifo', 'other'), 'file-preview-note', 'Type: other. No preview.'],
      [noteTab('gone.txt', 'error', { error: 'not_found: no such file' }), 'file-preview-error', 'not_found: no such file'],
    ]
    for (const [tab, testId, text] of cases) {
      show(api([tab]))
      const panel = panelOf(tab.path)
      expect(within(panel).getByTestId(testId).textContent, tab.path).toBe(text)
      // let a lazy editor, if any were rendered, resolve before asserting its absence
      await new Promise((r) => setTimeout(r, 0))
      expect(within(panel).queryByTestId('file-editor'), tab.path).toBeNull()
      expect(within(panel).queryByRole('group', { name: 'Editor mode' }), tab.path).toBeNull()
      expect(within(panel).queryByRole('button', { name: 'Save' }), tab.path).toBeNull()
      cleanup()
    }
  })
})
