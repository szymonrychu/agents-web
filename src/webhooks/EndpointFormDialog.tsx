/**
 * Endpoint dialog for create, edit and clone. Create and edit share the form: type, preset, suffix, auth mode with
 * sender presets (every field editable), a Jinja2 prompt template with preview and filters. Edit changes everything
 * except the secret (Rotate is its own action); clone only takes the overrides the API accepts.
 */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
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
import TemplateEditor, { type TemplatePreview } from '../editor/TemplateEditor'
import { cloneEndpoint, createEndpoint, getMeta, patchEndpoint, previewTemplate } from './api'
import type { CloneIn, EndpointCreated, EndpointIn, EndpointPatch, EndpointView, FilterResult, Filters, WebhookMeta } from './api'
import { AUTH_MODES, AUTH_PRESETS, authPayload, presetById, presetFor, type AuthFields, type AuthMode } from './authPresets'
import { EMPTY_FILTERS, FiltersEditor } from './FiltersEditor'
import { sampleFor, TYPES } from './samples'

export type EndpointFormMode = 'create' | 'edit' | 'clone'

export interface EndpointFormDialogProps {
  open: boolean
  mode: EndpointFormMode
  /** The endpoint to edit or clone. */
  endpoint?: EndpointView
  onClose: () => void
  /** The saved endpoint; `secret` or `password` is set when a one-time credential was issued. */
  onDone: (result: EndpointCreated) => void
  /** Edit only: opens the rotate flow, which replaces the secret. */
  onRotate?: () => void
}

/** The backend's default minimum (WEBHOOK_MIN_PASSWORD_LENGTH); the backend stays authoritative. */
const MIN_PASSWORD = 16
const SUFFIX = /^[A-Za-z0-9._~-]{1,128}$/
const PLACEHOLDERS = ['type', 'source', 'kind', 'action', 'repo', 'number', 'url', 'title', 'body', 'labels', 'payload', 'event']

const authOf = (ep: EndpointView): AuthFields => ({
  mode: ep.auth_mode, header: ep.auth_header ?? '', prefix: ep.hmac_prefix ?? '', timestampHeader: ep.hmac_timestamp_header ?? '',
})
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function Body({ mode, endpoint, onClose, onDone, onRotate }: Omit<EndpointFormDialogProps, 'open'>) {
  const edit = mode === 'edit'
  const clone = mode === 'clone'
  const initialAuth: AuthFields = endpoint ? authOf(endpoint) : { ...presetById('basic') }
  const [type, setType] = useState(endpoint?.type ?? TYPES[0].value)
  const [presetId, setPresetId] = useState(endpoint?.preset_id ?? '')
  const [suffix, setSuffix] = useState(edit ? (endpoint?.suffix ?? '') : '')
  const [authPreset, setAuthPreset] = useState(presetFor(initialAuth).id)
  const [auth, setAuth] = useState<AuthFields>(initialAuth)
  const [withCreds, setWithCreds] = useState(false)
  const [username, setUsername] = useState(endpoint?.username ?? '')
  const [password, setPassword] = useState('')
  const [template, setTemplate] = useState(endpoint?.prompt_template ?? '')
  const [example, setExample] = useState(sampleFor(type))
  const [exampleTouched, setExampleTouched] = useState(false)
  const [filters, setFilters] = useState<Filters>(endpoint?.filters ?? EMPTY_FILTERS)
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
  const needsHeader = auth.mode === 'header' || auth.mode === 'hmac'
  const authError = needsHeader && auth.header.trim() === '' ? 'Required' : undefined
  const modeChanged = endpoint !== undefined && auth.mode !== endpoint.auth_mode
  const suffixChanged = edit && endpoint !== undefined && suffix !== endpoint.suffix

  // Edit sends only what changed; the auth fields go as one group because the backend validates them together.
  const patch = (): EndpointPatch => {
    if (!endpoint) return {}
    const out: EndpointPatch = {}
    if (presetId !== endpoint.preset_id) out.preset_id = presetId
    if (suffixChanged) out.suffix = suffix
    const nextTemplate = template.trim() ? template : null
    if (nextTemplate !== endpoint.prompt_template) out.prompt_template = nextTemplate
    if (!sameJson(filters, endpoint.filters)) out.filters = filters
    if (!sameJson(auth, authOf(endpoint))) Object.assign(out, authPayload(auth))
    if (auth.mode === 'basic' && (username || null) !== endpoint.username) out.username = username || null
    return out
  }
  const dirty = !edit || Object.keys(patch()).length > 0
  const valid = presetId !== '' && !suffixError && !passwordError && !authError && (!edit || suffix !== '') && dirty

  const pickAuthPreset = (id: string) => {
    setAuthPreset(id)
    // Custom keeps the current fields, so a manual start is not wiped.
    if (id === 'custom') return
    const { mode: m, header, prefix, timestampHeader } = presetById(id)
    setAuth({ mode: m, header, prefix, timestampHeader })
  }
  const setAuthField = (patchFields: Partial<AuthFields>) => setAuth((a) => ({ ...a, ...patchFields }))
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

  // The template editor's preview: the example JSON through the webhook preview; a rejection is shown by the editor.
  const previewPrompt = async (text: string): Promise<TemplatePreview> => {
    let parsed: unknown
    try {
      parsed = JSON.parse(example)
    } catch {
      throw new Error('Example JSON is not valid JSON')
    }
    const out = await previewTemplate({ type, example: parsed, template: text })
    return { rendered: out.prompt, error: null, variables: [] }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (clone && endpoint) {
        const body: CloneIn = {}
        if (suffix) body.suffix = suffix
        if (presetId !== endpoint.preset_id) body.preset_id = presetId
        onDone(await cloneEndpoint(String(endpoint.id), body))
      } else if (edit && endpoint) {
        onDone(await patchEndpoint(String(endpoint.id), patch()))
      } else {
        const body: EndpointIn = { type, preset_id: presetId, ...authPayload(auth) }
        if (suffix) body.suffix = suffix
        if (auth.mode === 'basic' && withCreds) {
          if (username) body.username = username
          if (password) body.password = password
        }
        if (template.trim()) body.prompt_template = template
        if (hasRules) body.filters = filters
        onDone(await createEndpoint(body))
      }
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  const title = clone ? 'Clone endpoint' : edit ? 'Edit endpoint' : 'New endpoint'
  const action = clone ? 'Clone' : edit ? 'Save' : 'Create'
  return (
    <>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {clone && (
          <Alert severity="info">
            {`Copies the type, auth mode, template and filters of ${endpoint?.url ?? 'the endpoint'} into a new endpoint. A new secret is issued and shown once; the secret and password are never copied.`}
          </Alert>
        )}
        {!clone && (
          <TextField select size="small" label="Type" value={type} onChange={(e) => changeType(e.target.value)} disabled={edit} fullWidth>
            {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
        )}
        <PresetSelect value={presetId} onChange={setPresetId} />
        <TextField
          size="small" label="Suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)}
          error={Boolean(suffixError)} helperText={suffixError ?? 'Random when empty'} fullWidth
        />
        {suffixChanged && <Alert severity="warning">The sender URL changes with the suffix; update the webhook at the sender.</Alert>}
        {!clone && (
          <>
            <TextField select size="small" label="Auth preset" value={authPreset} onChange={(e) => pickAuthPreset(e.target.value)} fullWidth>
              {AUTH_PRESETS.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Auth mode" value={auth.mode} onChange={(e) => setAuthField({ mode: e.target.value as AuthMode })} fullWidth>
              {AUTH_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </TextField>
            {needsHeader && (
              <TextField
                size="small" label="Header name" value={auth.header} onChange={(e) => setAuthField({ header: e.target.value })}
                error={Boolean(authError)} helperText={authError ?? 'The request header the sender puts the secret or signature in'} fullWidth
              />
            )}
            {auth.mode === 'hmac' && (
              <>
                <TextField
                  size="small" label="HMAC prefix" value={auth.prefix} onChange={(e) => setAuthField({ prefix: e.target.value })}
                  helperText="Text before the hex digest, e.g. sha256= for GitHub; empty for none" fullWidth
                />
                <TextField
                  size="small" label="Timestamp header" value={auth.timestampHeader} onChange={(e) => setAuthField({ timestampHeader: e.target.value })}
                  helperText="Optional; when set the timestamp is signed with the body and checked against a replay window" fullWidth
                />
              </>
            )}
            {modeChanged && endpoint && (
              <Alert severity="warning">
                Changing the auth mode means a new secret is issued and shown once; the sender must be updated with it, and the old secret stops working.
              </Alert>
            )}
            {edit && auth.mode !== 'basic' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Secret: set, never shown</Typography>
                {onRotate && !modeChanged && <Button onClick={onRotate}>Rotate secret</Button>}
              </Box>
            )}
            {auth.mode === 'basic' && !edit && (
              <FormControlLabel control={<Switch checked={withCreds} onChange={(e) => setWithCreds(e.target.checked)} />} label="Set credentials" />
            )}
            {auth.mode === 'basic' && (edit || withCreds) && (
              <TextField size="small" label="Username" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth />
            )}
            {auth.mode === 'basic' && !edit && withCreds && (
              <TextField
                size="small" label="Password" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} error={Boolean(passwordError)}
                helperText={passwordError ?? `At least ${MIN_PASSWORD} characters; random when empty`} fullWidth
              />
            )}
            {edit && auth.mode === 'basic' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>Password: set, never shown</Typography>
                {onRotate && !modeChanged && <Button onClick={onRotate}>Rotate secret</Button>}
              </Box>
            )}
            <TemplateEditor
              label="Prompt template" value={template} onChange={(t) => { setTemplate(t); clearPreview() }}
              preview={previewPrompt} previewLabel="Preview template"
            />
            <Typography variant="caption" color="text.secondary">
              {`Jinja2, optional; default prompt when empty. Variables: ${PLACEHOLDERS.map((p) => `{{ ${p} }}`).join(', ')}. Filter: from_json.`}
            </Typography>
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
          </>
        )}
        <FormError error={error as never} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!valid || busy}>{action}</Button>
      </DialogActions>
    </>
  )
}

export function EndpointFormDialog({ open, ...rest }: EndpointFormDialogProps) {
  return (
    <Dialog open={open} onClose={rest.onClose} fullWidth maxWidth="md">
      <Body {...rest} />
    </Dialog>
  )
}
