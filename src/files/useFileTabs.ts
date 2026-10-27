/**
 * The open files of one session as tabs: one tab per path, RO by default, unsaved text, saves against the stamp the
 * tab loaded, conflicts, and the live refresh rules. A module-level store keyed by session id keeps every session's
 * tabs for the page's lifetime (a reload starts empty), so the panel remounting per session never loses an edit.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { ApiError } from '../api/client'
import { readFile, writeFile } from '../api/files'
import type { FileContent, FileEntry, FileStamp } from '../api/files'
import { errorText } from './useFileTree'

export type TabKind = 'loading' | 'text' | 'binary' | 'too_large' | 'other' | 'error'
export type TabMode = 'ro' | 'rw'

export interface FileTab {
  path: string
  /** Last path segment. */
  name: string
  kind: TabKind
  /** The latest answer of the content route (updated by a save), null while loading, for `other` and on error. */
  file: FileContent | null
  /** `<code>: <message>` of a failed read. */
  error: string | null
  mode: TabMode
  /** Stamp of the text the tab loaded or last saved: what a save expects on disk. */
  baseline: FileStamp | null
  /** The tab's current text, for the editor; it resets to it whenever `docVersion` changes. */
  doc: string
  docVersion: number
  /** The current text differs from the baseline text. */
  dirty: boolean
  saving: boolean
  /** `<code>: <message>` of a failed save other than a conflict. */
  saveError: string | null
  /** A save answered 409 `file_changed`: reload or overwrite. */
  conflict: boolean
  /** The file changed on disk while the tab had unsaved changes: reload or keep editing. */
  changedOnDisk: boolean
}

export interface FileTabs {
  tabs: FileTab[]
  active: string | null
  /** Opens a tab and focuses it, or focuses the open tab of `path` without a refetch; a directory opens nothing. */
  open(path: string, type: FileEntry['type']): void
  focus(path: string): void
  close(path: string): void
  /** Switching to RO is refused while the tab is dirty; only text tabs have a mode to switch. */
  setMode(path: string, mode: TabMode): void
  /** The editor's full text after a change; ignored unless the tab is a text tab in RW. */
  edit(path: string, text: string): void
  save(path: string): void
  /** Saves without the stamp precondition, after the user chose Overwrite on a conflict. */
  overwrite(path: string): void
  /** Refetches the file, dropping the edits, the conflict and the changed-on-disk notice. */
  reload(path: string): void
  keepEditing(path: string): void
  /** Applies the live refresh rules to the `mtime|size` stamps of the tabs' entries in the loaded listings (null: not listed). */
  observe(stampOf: (path: string) => string | null): void
  /** An agent write tool finished on `path`. */
  written(path: string): void
}

interface Snapshot {
  tabs: FileTab[]
  active: string | null
}

/** Per-tab bookkeeping that never renders. */
interface Entry {
  /** The text the baseline stamp belongs to. */
  baseText: string
  /** The current text (typing replaces it without a render unless `dirty` flips). */
  text: string
  /** Last `mtime|size` stamp seen for the path; undefined until the first answer, then never reset by a refetch. */
  seen: string | null | undefined
  /** Token of the read in flight; any other answer is stale. */
  read: number
  /** Token of the save in flight; any other answer is stale. */
  write: number
}

type Actions = Omit<FileTabs, 'tabs' | 'active'>

interface Store {
  snapshot: () => Snapshot
  subscribe: (listener: () => void) => () => void
  actions: Actions
}

type Load = 'open' | 'refresh' | 'reload'

const stores = new Map<string, Store>()
let lastToken = 0
const token = () => ++lastToken

const stampKey = (s: { mtime: string; size: number }) => `${s.mtime}|${s.size}`
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function newTab(path: string, kind: TabKind): FileTab {
  return {
    path,
    name: nameOf(path),
    kind,
    file: null,
    error: null,
    mode: 'ro',
    baseline: null,
    doc: '',
    docVersion: 0,
    dirty: false,
    saving: false,
    saveError: null,
    conflict: false,
    changedOnDisk: false,
  }
}

function createStore(sessionId: string): Store {
  let snap: Snapshot = { tabs: [], active: null }
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()

  /** `notify` false replaces the snapshot without a render: the next render of any cause picks it up. */
  const set = (next: Snapshot, notify = true) => {
    snap = next
    if (notify) for (const l of listeners) l()
  }
  const find = (path: string) => snap.tabs.find((t) => t.path === path)
  const patch = (path: string, fn: (t: FileTab) => FileTab, notify = true) =>
    set({ ...snap, tabs: snap.tabs.map((t) => (t.path === path ? fn(t) : t)) }, notify)
  /** A dirty or saving tab must not be replaced from disk. */
  const busy = (t: FileTab) => t.dirty || t.saving

  const answer = (path: string, e: Entry, file: FileContent | null, error: string | null) => {
    const stamp = file ? { mtime: file.mtime, size: file.size } : null
    if (e.seen === undefined) e.seen = stamp ? stampKey(stamp) : null
    const body = file?.kind === 'text' ? (file.content ?? '') : ''
    e.baseText = body
    e.text = body
    patch(path, (t) => ({
      ...t,
      kind: file ? file.kind : 'error',
      file,
      error,
      baseline: stamp,
      doc: body,
      docVersion: t.docVersion + 1,
      dirty: false,
      saveError: null,
      conflict: false,
      changedOnDisk: false,
    }))
  }

  const load = (path: string, how: Load) => {
    const e = entries.get(path)
    if (!e) return
    const mine = token()
    e.read = mine
    if (how === 'reload') {
      e.write = token()
      patch(path, (t) => ({ ...t, saving: false }))
    }
    const settle = (file: FileContent | null, error: string | null) => {
      const cur = entries.get(path)
      const t = find(path)
      if (cur?.read !== mine || !t) return
      // the user started typing (or saving) while a live refetch was in flight: keep the edits, raise the notice
      if (how === 'refresh' && busy(t)) return patch(path, (x) => ({ ...x, changedOnDisk: true }))
      answer(path, cur, file, error)
    }
    readFile(sessionId, path).then(
      (file) => settle(file, null),
      (err: unknown) => settle(null, errorText(err)),
    )
  }

  /** The file changed on disk: refetch a clean tab (mode kept), only raise the notice on a dirty one. */
  const changed = (t: FileTab) => {
    if (!busy(t)) return load(t.path, 'refresh')
    if (!t.changedOnDisk) patch(t.path, (x) => ({ ...x, changedOnDisk: true }))
  }

  const write = (path: string, overwrite: boolean) => {
    const t = find(path)
    const e = entries.get(path)
    if (!t || !e || t.kind !== 'text' || t.mode !== 'rw' || t.saving) return
    const sent = e.text
    const mine = token()
    e.write = mine
    // a read in flight answers with the text from before this save: drop it
    e.read = token()
    patch(path, (x) => ({ ...x, saving: true, saveError: null }))
    const current = () => {
      const cur = entries.get(path)
      return cur?.write === mine && find(path) ? cur : null
    }
    writeFile(sessionId, path, sent, overwrite ? null : t.baseline).then(
      (w) => {
        const cur = current()
        if (!cur) return
        cur.baseText = sent
        const baseline = { mtime: w.mtime, size: w.size }
        patch(path, (x) => ({
          ...x,
          file: x.file && { ...x.file, content: sent, ...baseline },
          baseline,
          dirty: cur.text !== sent,
          saving: false,
          saveError: null,
          conflict: false,
          changedOnDisk: false,
        }))
      },
      (err: unknown) => {
        if (!current()) return
        const conflict = err instanceof ApiError && err.status === 409 && err.code === 'file_changed'
        patch(path, (x) => (conflict ? { ...x, saving: false, conflict: true } : { ...x, saving: false, saveError: errorText(err) }))
      },
    )
  }

  const actions: Actions = {
    open(path, type) {
      if (type === 'dir') return
      if (find(path)) return set({ ...snap, active: path })
      entries.set(path, { baseText: '', text: '', seen: undefined, read: 0, write: 0 })
      set({ tabs: [...snap.tabs, newTab(path, type === 'other' ? 'other' : 'loading')], active: path })
      if (type !== 'other') load(path, 'open')
    },
    focus(path) {
      if (find(path) && snap.active !== path) set({ ...snap, active: path })
    },
    close(path) {
      const index = snap.tabs.findIndex((t) => t.path === path)
      if (index < 0) return
      entries.delete(path)
      const rest = snap.tabs.filter((t) => t.path !== path)
      set({ tabs: rest, active: snap.active === path ? (rest[Math.min(index, rest.length - 1)]?.path ?? null) : snap.active })
    },
    setMode(path, mode) {
      const t = find(path)
      if (!t || t.kind !== 'text' || t.mode === mode || (mode === 'ro' && t.dirty)) return
      patch(path, (x) => ({ ...x, mode }))
    },
    edit(path, text) {
      const t = find(path)
      const e = entries.get(path)
      if (!t || !e || t.kind !== 'text' || t.mode !== 'rw') return
      e.text = text
      const dirty = text !== e.baseText
      patch(path, (x) => ({ ...x, doc: text, dirty }), dirty !== t.dirty)
    },
    save: (path) => write(path, false),
    overwrite: (path) => write(path, true),
    reload(path) {
      const t = find(path)
      if (t && t.kind !== 'other') load(path, 'reload')
    },
    keepEditing(path) {
      if (find(path)?.changedOnDisk) patch(path, (x) => ({ ...x, changedOnDisk: false }))
    },
    observe(stampOf) {
      for (const t of snap.tabs) {
        const e = entries.get(t.path)
        if (t.kind === 'other' || !e || e.seen === undefined) continue
        const stamp = stampOf(t.path)
        if (stamp === null || stamp === e.seen) continue
        e.seen = stamp
        // a save's own new stamp is the baseline
        if (t.baseline && stamp === stampKey(t.baseline)) continue
        changed(t)
      }
    },
    written(path) {
      const t = find(path)
      if (t && t.kind !== 'other') changed(t)
    },
  }

  return {
    snapshot: () => snap,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
  }
}

function storeFor(sessionId: string): Store {
  let store = stores.get(sessionId)
  if (!store) {
    store = createStore(sessionId)
    stores.set(sessionId, store)
  }
  return store
}

export function useFileTabs(sessionId: string): FileTabs {
  const store = storeFor(sessionId)
  const snap = useSyncExternalStore(store.subscribe, store.snapshot)
  return useMemo(() => ({ ...store.actions, tabs: snap.tabs, active: snap.active }), [store, snap])
}
