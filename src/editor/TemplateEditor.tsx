/**
 * A Jinja template field: the code editor with the jinja mode, a Preview button that renders the template through a
 * backend preview endpoint, the render error with its line, and the template's variables as chips. Backend-agnostic:
 * the caller passes `preview`, built with `postTemplatePreview` for the surface it edits.
 */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, useState, type JSX } from 'react'

const CodeEditor = lazy(() => import('./CodeEditor'))

export interface TemplatePreview {
  /** The rendered text, or null when the template failed to render. */
  rendered: string | null
  error: { line: number | null; message: string } | null
  /** Variable names the template refers to. */
  variables: string[]
}

export interface TemplateEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Renders the template; a rejection is shown as an error. */
  preview: (template: string) => Promise<TemplatePreview>
  disabled?: boolean
  /** The preview button's text; default "Preview". */
  previewLabel?: string
}

/**
 * A preview function for `POST <previewUrl>` with body `{template, surface}`, the contract of the services'
 * template preview endpoints; `previewUrl` is a path from `config.json`, never a host.
 */
export function postTemplatePreview(previewUrl: string, surface: string): (template: string) => Promise<TemplatePreview> {
  return async (template) => {
    const res = await fetch(previewUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template, surface }),
    })
    if (!res.ok) throw new Error(`preview failed: HTTP ${res.status}`)
    const body = (await res.json()) as Partial<TemplatePreview>
    return { rendered: body.rendered ?? null, error: body.error ?? null, variables: body.variables ?? [] }
  }
}

export default function TemplateEditor({ label, value, onChange, preview, disabled = false, previewLabel = 'Preview' }: TemplateEditorProps): JSX.Element {
  // `forValue` is the template the shown preview was made from; a different value hides it as stale
  const [preview_, setPreview] = useState<{ result: TemplatePreview; forValue: string } | null>(null)
  // `seen` is the last text the editor itself reported; a value that differs came from outside and replaces the document
  const [sync, setSync] = useState({ seen: value, docVersion: 1 })
  if (sync.seen !== value) setSync({ seen: value, docVersion: sync.docVersion + 1 })
  const result = preview_ !== null && preview_.forValue === value ? preview_.result : null
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setFailure(null)
    try {
      setPreview({ result: await preview(value), forValue: value })
    } catch (e) {
      setPreview(null)
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const error = result?.error ?? null
  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="body2" component="label">
        {label}
      </Typography>
      <Box sx={{ minHeight: 96, maxHeight: 320, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
        <Suspense fallback={null}>
          <CodeEditor path="template.j2" doc={value} docVersion={sync.docVersion} readOnly={disabled} onChange={(text) => { setSync((c) => ({ ...c, seen: text })); onChange(text) }} onSave={() => undefined} />
        </Suspense>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" onClick={() => void run()} disabled={disabled || busy || value.trim() === ''}>
          {previewLabel}
        </Button>
        {result?.variables.map((v) => (
          <Chip key={v} size="small" label={v} />
        ))}
      </Box>
      {error && (
        <Alert severity="error" variant="outlined">
          {error.line === null ? error.message : `line ${error.line}: ${error.message}`}
        </Alert>
      )}
      {failure && (
        <Alert severity="error" variant="outlined">
          {failure}
        </Alert>
      )}
      {result?.rendered != null && !error && (
        <Box data-testid="template-rendered" component="pre" sx={{ m: 0, p: 1, whiteSpace: 'pre-wrap', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {result.rendered}
        </Box>
      )}
    </Box>
  )
}
