/**
 * Read-only diff of two values, GitHub "Files changed" style. Every value becomes a doc (`toDoc`): from md up a
 * CodeMirror MergeView side by side (a-b, captions above the panes), below md one editor with `unifiedMergeView`
 * (removed lines above added ones). Unchanged runs collapse unless `expanded`; no revert or merge controls. Colours
 * follow the MUI palette mode. Default export so callers load it with `React.lazy`, keeping CodeMirror out of the
 * main chunk.
 */
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useLayoutEffect, useRef, type JSX } from 'react'
import { diffAppearance } from '../editor/diffTheme'
import type { DiffMode } from '../theme'
import { diffCounts, type DiffCounts } from './diffCounts'
import { toDoc } from './diffText'

export interface ValueDiffProps {
  before: unknown
  after: unknown
  /** Strings diff as raw multi-line text (a prompt) instead of YAML. */
  text?: boolean
  /** Names of the two sides, captions of the panes and labels of the editors. */
  labels?: readonly [string, string]
  /** Show every line: unchanged runs are not collapsed. */
  expanded?: boolean
  /** Called with the +N -M line counts whenever the compared docs change. */
  onCounts?: (c: DiffCounts) => void
}

const DEFAULT_LABELS = ['Current', 'Proposed'] as const
const COLLAPSE = { margin: 3 }

const sideExtensions = (mode: DiffMode, label: string): Extension => [
  lineNumbers(),
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  diffAppearance(mode),
  EditorView.contentAttributes.of({ 'aria-label': label }),
]

export default function ValueDiff({ before, after, text, labels = DEFAULT_LABELS, expanded = false, onCounts }: ValueDiffProps): JSX.Element {
  const theme = useTheme()
  const narrow = useMediaQuery(theme.breakpoints.down('md'))
  const mode: DiffMode = theme.palette.mode
  const host = useRef<HTMLDivElement>(null)
  // the docs, not the props, key the effects: an object prop with a new identity but equal content must not rebuild
  const docA = toDoc(before, text)
  const docB = toDoc(after, text)
  const [labelA, labelB] = labels

  // the latest callback, so a new function identity neither rebuilds the view nor re-reports
  const countsRef = useRef(onCounts)
  useLayoutEffect(() => {
    countsRef.current = onCounts
  })
  useEffect(() => {
    countsRef.current?.(diffCounts(docA, docB))
  }, [docA, docB])

  // rebuilt whenever the compared texts, the layout, the expansion or the palette mode change
  useLayoutEffect(() => {
    const parent = host.current ?? undefined
    let views: EditorView[]
    let destroy: () => void
    if (narrow) {
      const view = new EditorView({
        parent,
        doc: docB,
        extensions: [
          sideExtensions(mode, `${labelA} to ${labelB}`),
          unifiedMergeView({ original: docA, mergeControls: false, gutter: true, ...(expanded ? {} : { collapseUnchanged: COLLAPSE }) }),
        ],
      })
      views = [view]
      destroy = () => view.destroy()
    } else {
      const merge = new MergeView({
        parent,
        a: { doc: docA, extensions: sideExtensions(mode, labelA) },
        b: { doc: docB, extensions: sideExtensions(mode, labelB) },
        orientation: 'a-b',
        gutter: true,
        ...(expanded ? {} : { collapseUnchanged: COLLAPSE }),
      })
      views = [merge.a, merge.b]
      destroy = () => merge.destroy()
    }
    // wrapped lines change height with the host width: re-measure on resize
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => views.forEach((v) => v.requestMeasure()))
    if (observer && host.current) observer.observe(host.current)
    return () => {
      observer?.disconnect()
      destroy()
    }
  }, [docA, docB, narrow, expanded, mode, labelA, labelB])

  return (
    <Box>
      {!narrow && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {labelA}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {labelB}
          </Typography>
        </Box>
      )}
      <Box
        ref={host}
        data-testid={narrow ? 'value-diff-unified' : 'value-diff-merge'}
        sx={{
          maxHeight: '60vh',
          overflow: 'auto',
          // editors size to their content (highlight.ts gives them height:100%); the host scrolls past the max
          '& .cm-editor': { height: 'auto' },
        }}
      />
    </Box>
  )
}
