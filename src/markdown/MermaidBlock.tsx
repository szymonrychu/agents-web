/**
 * One mermaid diagram. The mermaid library (large) is loaded on first use via a dynamic import, so it lives in its own chunk.
 * Safety: securityLevel 'strict' makes mermaid sanitize the diagram text and disable click handlers; the svg it returns is
 * inserted as markup, which is why nothing else may reach that sink.
 */
import { useEffect, useId, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { useTheme } from '@mui/material/styles'
import { MONO_FONT, TOKENS } from '../theme'

type MermaidApi = (typeof import('mermaid'))['default']

let loaded: Promise<MermaidApi> | undefined
let initTheme: string | undefined

/** Load mermaid once and (re)initialize it only when the theme changes. */
function mermaidFor(theme: 'dark' | 'default'): Promise<MermaidApi> {
  loaded ??= import('mermaid').then((m) => m.default)
  return loaded.then((api) => {
    if (initTheme !== theme) {
      api.initialize({ startOnLoad: false, securityLevel: 'strict', layout: 'dagre', look: 'classic', theme })
      initTheme = theme
    }
    return api
  })
}

/** The outcome for one (source, mode) pair; a result for another pair counts as still loading. */
type Result = { key: string; svg?: string }

export function MermaidBlock({ source }: { source: string }) {
  const mode = useTheme().palette.mode
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [result, setResult] = useState<Result>()
  const key = `${mode}\n${source}`

  useEffect(() => {
    let live = true
    mermaidFor(mode === 'dark' ? 'dark' : 'default')
      .then(async (api) => {
        if (!(await api.parse(source, { suppressErrors: true }))) throw new Error('invalid diagram')
        return api.render(id, source)
      })
      .then(({ svg }) => live && setResult({ key, svg }))
      .catch(() => {
        document.getElementById(`d${id}`)?.remove()
        if (live) setResult({ key })
      })
    return () => {
      live = false
    }
  }, [source, mode, id, key])

  const state = result?.key === key ? result : undefined
  if (state?.svg !== undefined) return <Box sx={{ overflowX: 'auto', '& svg': { maxWidth: '100%', height: 'auto' } }} dangerouslySetInnerHTML={{ __html: state.svg }} />
  return (
    <Box>
      {state ? <Chip size="small" color="error" label="diagram error" /> : null}
      <Box
        component="pre"
        sx={{ fontFamily: MONO_FONT, fontSize: `${TOKENS.fontSizes.sm / 16}rem`, m: 0, p: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', bgcolor: TOKENS.bgRaised, border: TOKENS.borderWidth, borderColor: 'divider', borderRadius: 1 }}
      >
        {source}
      </Box>
    </Box>
  )
}
