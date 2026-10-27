/**
 * The file editor: one CodeMirror view with line numbers, undo history, the file's language, syntax marks and the
 * theme's look, and nothing that hints (no autocompletion, hover or tooltip extension). Default export so the Files
 * panel can load it with `React.lazy`, keeping CodeMirror out of the main chunk.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState, Prec, type Extension, type StateEffect } from '@codemirror/state'
import { drawSelection, EditorView, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import Box from '@mui/material/Box'
import { useLayoutEffect, useRef, useState, type JSX } from 'react'
import { editorAppearance } from './highlight'
import { languageFor } from './languages'
import { syntaxChecker } from './syntaxCheck'

export interface CodeEditorProps {
  /** Workspace path of the file; picks the language. */
  path: string
  /** The loaded text, applied when the editor mounts and whenever `docVersion` changes. */
  doc: string
  /** A new value replaces the document with `doc` and clears the undo history; the same value keeps the edits. */
  docVersion: number
  readOnly: boolean
  /** Called on every document change with the full text, line separators as loaded. */
  onChange: (text: string) => void
  /** Called on Ctrl+S or Cmd+S in the editor, in both modes; the browser's save dialog never opens. */
  onSave: () => void
}

/** What the current view state was built or last reconfigured from. */
interface Applied {
  path: string
  docVersion: number
  readOnly: boolean
}

/** The per-instance parts every state of one editor shares: its compartments and the callbacks into the latest props. */
interface Wiring {
  mode: Compartment
  language: Compartment
  onChange: (text: string) => void
  onSave: () => void
}

const modeExtension = (readOnly: boolean): Extension => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]

function languageExtension(path: string): Extension {
  const { id, support } = languageFor(path)
  return [support, syntaxChecker(id)]
}

/** A fresh state of `doc`: no history, the mode and language of the props, and a CRLF separator for a CRLF file. */
function createState(wiring: Wiring, { path, doc, readOnly }: Pick<CodeEditorProps, 'path' | 'doc' | 'readOnly'>): EditorState {
  const save = () => {
    wiring.onSave()
    return true
  }
  return EditorState.create({
    doc,
    extensions: [
      // lines split and join on the file's own separator, so the text round-trips byte for byte
      EditorState.lineSeparator.of(doc.includes('\r\n') ? '\r\n' : '\n'),
      lineNumbers(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      // Ctrl and Cmd both save on every platform
      Prec.highest(keymap.of([{ key: 'Ctrl-s', run: save, preventDefault: true }, { key: 'Meta-s', run: save, preventDefault: true }])),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      wiring.mode.of(modeExtension(readOnly)),
      wiring.language.of(languageExtension(path)),
      editorAppearance,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) wiring.onChange(update.state.sliceDoc())
      }),
    ],
  })
}

export default function CodeEditor(props: CodeEditorProps): JSX.Element {
  const { path, docVersion, readOnly } = props
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const applied = useRef<Applied | null>(null)
  const latest = useRef(props)
  const [wiring] = useState<Wiring>(() => ({
    mode: new Compartment(),
    language: new Compartment(),
    onChange: (text) => latest.current.onChange(text),
    onSave: () => latest.current.onSave(),
  }))

  // first, so the effects below and the editor's callbacks always see the current props
  useLayoutEffect(() => {
    latest.current = props
  })

  useLayoutEffect(() => {
    const { current } = latest
    const created = new EditorView({ parent: host.current ?? undefined, state: createState(wiring, current) })
    view.current = created
    applied.current = { path: current.path, docVersion: current.docVersion, readOnly: current.readOnly }
    return () => {
      created.destroy()
      view.current = null
      applied.current = null
    }
  }, [wiring])

  // a new docVersion replaces the state; otherwise path and mode are reconfigured in place, keeping doc and history
  useLayoutEffect(() => {
    const v = view.current
    const was = applied.current
    if (!v || !was) return
    if (was.docVersion !== docVersion) {
      v.setState(createState(wiring, latest.current))
    } else {
      const effects: StateEffect<unknown>[] = []
      if (was.path !== path) effects.push(wiring.language.reconfigure(languageExtension(path)))
      if (was.readOnly !== readOnly) effects.push(wiring.mode.reconfigure(modeExtension(readOnly)))
      if (effects.length) v.dispatch({ effects })
    }
    applied.current = { path, docVersion, readOnly }
  }, [wiring, path, docVersion, readOnly])

  return <Box ref={host} data-testid="file-editor" sx={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}
