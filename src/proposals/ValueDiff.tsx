/**
 * Read-only side-by-side diff of two values. Scalars render as a two-column text row; objects and arrays render as
 * sorted YAML in a CodeMirror MergeView (a-b, unchanged runs collapsed, no revert controls). Default export so callers
 * can load it with `React.lazy`, keeping CodeMirror out of the main chunk.
 */
import { MergeView } from '@codemirror/merge'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import Box from '@mui/material/Box'
import { useLayoutEffect, useRef, type JSX } from 'react'
import { stringify } from 'yaml'
import { editorAppearance } from '../editor/highlight'

export interface ValueDiffProps {
  before: unknown
  after: unknown
}

const isStructured = (v: unknown): boolean => typeof v === 'object' && v !== null

const toYaml = (v: unknown): string => stringify(v, { sortMapEntries: true })

const scalarText = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v))

const sideExtensions: Extension = [
  lineNumbers(),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  editorAppearance,
]

function MergeDiff({ before, after }: ValueDiffProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  // the view is built once from the props of the first render
  const initial = useRef({ before, after })

  // created once per mount
  useLayoutEffect(() => {
    const view = new MergeView({
      parent: host.current ?? undefined,
      a: { doc: toYaml(initial.current.before), extensions: sideExtensions },
      b: { doc: toYaml(initial.current.after), extensions: sideExtensions },
      orientation: 'a-b',
      collapseUnchanged: { margin: 3 },
    })
    return () => view.destroy()
  }, [])

  return (
    <Box
      ref={host}
      data-testid="value-diff-merge"
      sx={{
        height: 360,
        overflow: 'auto',
        // below md the two columns stack
        '& .cm-mergeView': { display: 'flex', flexDirection: { xs: 'column', md: 'row' } },
        '& .cm-mergeViewEditors': { flexDirection: { xs: 'column', md: 'row' } },
      }}
    />
  )
}

export default function ValueDiff({ before, after }: ValueDiffProps): JSX.Element {
  if (isStructured(before) || isStructured(after)) return <MergeDiff before={before} after={after} />
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1, fontFamily: 'monospace' }}>
      <Box data-testid="value-diff-before" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {scalarText(before)}
      </Box>
      <Box data-testid="value-diff-after" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {scalarText(after)}
      </Box>
    </Box>
  )
}
