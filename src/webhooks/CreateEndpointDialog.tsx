/** Create-endpoint dialog: type, preset, optional suffix, credentials and a Jinja2 prompt template with preview. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FormError, PresetSelect } from '../triggers'
import { createEndpoint, getMeta, previewTemplate } from './api'
import type { EndpointCreated, EndpointIn, FilterResult, Filters, WebhookMeta } from './api'
import { EMPTY_FILTERS, FiltersEditor } from './FiltersEditor'
import { sampleFor, TYPES } from './samples'

export interface CreateEndpointDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (created: EndpointCreated) => void
}

/** The backend's default minimum (WEBHOOK_MIN_PASSWORD_LENGTH); the backend stays authoritative. */
const MIN_PASSWORD = 16
const SUFFIX = /^[A-Za-z0-9._~-]{1,128}$/
const PLACEHOLDERS = ['type', 'source', 'kind', 'action', 'repo', 'number', 'url', 'title', 'body', 'labels', 'payload', 'event']

function Body({ onClose, onCreated }: Omit<CreateEndpointDialogProps, 'open'>) {
  const [type, setType] = useState(TYPES[0].value)
  const [presetId, setPresetId] = useState('')
  const [suffix, setSuffix] = useState('')
  const [withCreds, setWithCreds] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [template, setTemplate] = useState('')
  const [example, setExample] = useState(sampleFor(TYPES[0].value))
  const [exampleTouched, setExampleTouched] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [meta, setMeta] = useState<WebhookMeta | null>(null)
  const [metaError, setMetaError] = useState<unknown>(null)
  const [rendered, setRendered] = useState<string | null>(null)
  const [filterResult, setFilterResult] = useState<FilterResult | null>(null)
  const [previewError, setPreviewError] = useState<unknown>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getMeta().then((m) => { if (live) setMeta(m) }, (e) => { if (live) setMetaError(e) })
    return () => { live = false }
  }, [])

  // The editor drops rules whose field is not in `fields`, so it mounts only once the type's fields are known.
  const filterFields = meta?.filter_fields[type]
  const hasRules = filters.allow.length > 0 || filters.deny.length > 0
  const clearPreview = () => { setRendered(null); setFilterResult(null) }

  const suffixError = suffix !== '' && !SUFFIX.test(suffix) ? 'Use 1-128 letters, digits, dot, underscore, tilde or hyphen' : undefined
  const passwordError = withCreds && password !== '' && password.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters` : undefined
  const valid = presetId !== '' && !suffixError && !passwordError

  const changeType = (next: string) => {
    setType(next)
    if (!exampleTouched) setExample(sampleFor(next))
    clearPreview()
  }

  const preview = async () => {
    clearPreview()
    setPreviewError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(example)
    } catch {
      setPreviewError('Example JSON is not valid JSON')
      return
    }
    try {
      const out = await previewTemplate({
        type, example: parsed,
        ...(template.trim() ? { template } : {}),
        ...(hasRules ? { filters } : {}),
      })
      setRendered(out.prompt)
      setFilterResult(out.filters)
    } catch (e) {
      setPreviewError(e)
    }
  }

  const submit = async () => {
    const body: EndpointIn = { type, preset_id: presetId }
    if (suffix) body.suffix = suffix
    if (withCreds) {
      if (username) body.username = username
      if (password) body.password = password
    }
    if (template.trim()) body.prompt_template = template
    if (hasRules) body.filters = filters
    setBusy(true)
    setError(null)
    try {
      onCreated(await createEndpoint(body))
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle>New endpoint</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField select size="small" label="Type" value={type} onChange={(e) => changeType(e.target.value)} fullWidth>
          {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <PresetSelect value={presetId} onChange={setPresetId} />
        <TextField
          size="small" label="Suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)}
          error={Boolean(suffixError)} helperText={suffixError ?? 'Random when empty'} fullWidth
        />
        <FormControlLabel control={<Switch checked={withCreds} onChange={(e) => setWithCreds(e.target.checked)} />} label="Set credentials" />
        {withCreds && (
          <>
            <TextField size="small" label="Username" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth />
            <TextField
              size="small" label="Password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} error={Boolean(passwordError)}
              helperText={passwordError ?? `At least ${MIN_PASSWORD} characters; random when empty`} fullWidth
            />
          </>
        )}
        <TextField
          label="Prompt template" multiline minRows={4} value={template} onChange={(e) => { setTemplate(e.target.value); clearPreview() }}
          helperText={`Jinja2, optional; default prompt when empty. Variables: ${PLACEHOLDERS.map((p) => `{{ ${p} }}`).join(', ')}. Filter: from_json.`}
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} fullWidth
        />
        {filterFields ? <FiltersEditor type={type} fields={filterFields} value={filters} onChange={(f) => { setFilters(f); clearPreview() }} /> : <FormError error={metaError as never} />}
        <TextField
          label="Example JSON" multiline minRows={4} value={example}
          onChange={(e) => { setExample(e.target.value); setExampleTouched(true) }}
          helperText="A sample webhook payload to check how the template renders and whether the filters pass"
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} fullWidth
        />
        <Box>
          <Button variant="outlined" onClick={() => void preview()} disabled={!template.trim() && !hasRules}>Preview</Button>
        </Box>
        <FormError error={previewError as never} />
        {filterResult && (
          <Typography variant="body2" color={filterResult.passed ? 'success.main' : 'warning.main'}>
            {filterResult.passed ? 'Passes the filters' : `Ignored: ${filterResult.reason ?? 'filtered out'}`}
          </Typography>
        )}
        {rendered !== null && (
          <Box>
            <Typography variant="caption" color="text.secondary">Rendered prompt</Typography>
            <Box component="pre" sx={{ m: 0, p: 1, whiteSpace: 'pre-wrap', bgcolor: 'action.hover', borderRadius: 1 }}>{rendered}</Box>
          </Box>
        )}
        <FormError error={error as never} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!valid || busy}>Create</Button>
      </DialogActions>
    </>
  )
}

export function CreateEndpointDialog({ open, onClose, onCreated }: CreateEndpointDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <Body onClose={onClose} onCreated={onCreated} />
    </Dialog>
  )
}
