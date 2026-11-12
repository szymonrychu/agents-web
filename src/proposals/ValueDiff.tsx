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
import { editorAppearance } from '../editor/highlight'
import { isStructured, toDoc } from './diffText'

export interface ValueDiffProps {
  before: unknown
  after: unknown
  /** Strings diff as raw multi-line text (a schedule prompt) instead of YAML. */
  text?: boolean
}

const scalarText = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v))

const sideExtensions: Extension = [
  lineNumbers(),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  editorAppearance,
]

function MergeDiff({ before, after, text }: ValueDiffProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  // the docs, not the props, key the effect: an object prop with a new identity but equal content must not rebuild
  const docA = toDoc(before, text)
  const docB = toDoc(after, text)

  // rebuilt whenever the compared texts change, so content and measured line heights never go stale
  useLayoutEffect(() => {
    const view = new MergeView({
      parent: host.current ?? undefined,
      a: { doc: docA, extensions: sideExtensions },
      b: { doc: docB, extensions: sideExtensions },
      orientation: 'a-b',
      collapseUnchanged: { margin: 3 },
    })
    // wrapped lines change height with the host width: re-measure on resize
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { view.a.requestMeasure(); view.b.requestMeasure() })
    if (observer && host.current) observer.observe(host.current)
    return () => {
      observer?.disconnect()
      view.destroy()
    }
  }, [docA, docB])

  return (
    <Box
      ref={host}
      data-testid="value-diff-merge"
      sx={{
        height: 360,
        overflow: 'auto',
        // below md the two columns stack; .cm-mergeView stays a block so the editors row spans its full width
        // editors size to their content (highlight.ts gives them height:100%, which overlaps wrapped lines in a fixed host); the host scrolls
        '& .cm-editor': { height: 'auto' },
        '& .cm-mergeViewEditors': { flexDirection: { xs: 'column', md: 'row' } },
      }}
    />
  )
}

export default function ValueDiff({ before, after, text }: ValueDiffProps): JSX.Element {
  if (text || isStructured(before) || isStructured(after)) return <MergeDiff before={before} after={after} text={text} />
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
