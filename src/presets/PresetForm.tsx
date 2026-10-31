/** Preset editor (new, edit, copy): /meta defaults for unset fields, sparse saving, inline validation, server 409 and 422 shown in an Alert. */
import { useEffect, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { parseDotenv } from '../sessions/dotenv'
import { base, createPreset, getMeta, updatePreset } from '../api/client'
import EntryList from '../common/EntryList'
import TemplateEditor, { postTemplatePreview } from '../editor/TemplateEditor'
import HooksEditor from '../hooks/HooksEditor'
import type { Hooks } from '../hooks/types'
import type { SessionSpec, Meta, PresetView } from '../api/client'
import { CACHE_KEY_RESERVED_PREFIX, copyName, envKeyError, setKeyOf, stateFromPreset, toPresetSpec, validate } from '../sessions/sessionSpecForm'
import type { EnvRow, FormState, FormValues } from '../sessions/sessionSpecForm'

export interface PresetFormProps {
  open: boolean
  /** The preset being edited (edit mode). */
  preset?: PresetView
  /** The preset being copied (copy mode); saved as a new preset. */
  copyOf?: PresetView
  onClose: () => void
  onSaved: (preset: PresetView) => void
}

const AGENT_COMMANDS = ['compact', 'context', 'mcp', 'reload-plugins', 'reload-skills']
const NOT_AVAILABLE = ' (not available)'

type Surface = 'web_chat_start' | 'preset_text' | 'init_script'
/** Renders a template through the orchestrator's preview for the surface it is sent on. */
const previewFor = (surface: Surface) => postTemplatePreview(`${base()}/templates/preview`, surface)

const hooksOf = (text: string): Hooks | null => {
  try {
    const v: unknown = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Hooks) : null
  } catch {
    return null
  }
}

const stored = (p?: PresetView) => (p?.spec ?? {}) as Partial<SessionSpec>

/** The copy's spec: a preset-derived cache key belongs to the source, the copy derives its own. */
function copiedSpec(source: PresetView): Partial<SessionSpec> {
  const spec = stored(source)
  if (!spec.cache?.key?.startsWith(CACHE_KEY_RESERVED_PREFIX)) return spec
  return { ...spec, cache: { ...spec.cache, key: null } }
}

type PasteMerge = { errors: string[] } | { errors: null; rows: EnvRow[] | null }

/**
 * Parses pasted .env text and merges its pairs into the rows: an existing key is replaced in place (first match),
 * a new key is appended, and empty rows are dropped. `rows` is null when the text holds no pairs (nothing to change).
 */
function mergePaste(text: string, current: EnvRow[]): PasteMerge {
  const { pairs, errors } = parseDotenv(text)
  if (errors.length > 0) return { errors: errors.map((e) => `line ${e.line}: ${e.message}`) }
  if (pairs.length === 0) return { errors: null, rows: null }
  const rows = current.map((r) => ({ ...r }))
  for (const pair of pairs) {
    const existing = rows.find((r) => r.key === pair.key)
    if (existing) existing.value = pair.value
    else rows.push({ ...pair })
  }
  return { errors: null, rows: rows.filter((r) => r.key !== '' || r.value !== '') }
}

function initialState(meta: Meta | null, preset?: PresetView, copyOf?: PresetView): FormState {
  if (preset) return stateFromPreset(meta, preset.name, stored(preset))
  if (copyOf) return stateFromPreset(meta, copyName(copyOf.name), copiedSpec(copyOf))
  return stateFromPreset(meta, '', {})
}

function FormBody({ preset, copyOf, onClose, onSaved }: Omit<PresetFormProps, 'open'>) {
  const [source] = useState({ preset, copyOf })
  const [meta, setMeta] = useState<Meta | null>(null)
  const [state, setState] = useState<FormState>(() => initialState(null, preset, copyOf))
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteText, setPasteText] = useState<string | null>(null)
  const [pasteErrors, setPasteErrors] = useState<string[]>([])
  const touched = useRef(new Set<keyof FormValues>())
  const { values, setKeys } = state
  const editing = preset !== undefined
  const hive = /^\d+$/.test(values.maxReplicas.trim()) && Number(values.maxReplicas) > 1

  useEffect(() => {
    let cancelled = false
    getMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        setState((s) => {
          // meta-derived defaults go under whatever the user already edited
          const fresh = initialState(m, source.preset, source.copyOf)
          const values = { ...fresh.values } as Record<keyof FormValues, FormValues[keyof FormValues]>
          const setKeys = new Set(fresh.setKeys)
          for (const key of touched.current) {
            values[key] = s.values[key]
            const setKey = setKeyOf(key)
            if (setKey) setKeys.add(setKey)
          }
          return { values: values as unknown as FormValues, setKeys }
        })
      })
      .catch((e: unknown) => {
        if (!cancelled) setServerError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source])

  const errors = validate(values, meta, stored(preset).cache?.key)
  const cacheAvailable = meta?.cache.available === true
  const kubeAccessAvailable = meta?.kube_access.available === true
  const invalid = Object.keys(errors).length > 0
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setState((s) => {
      touched.current.add(key)
      const setKey = setKeyOf(key)
      return { values: { ...s.values, [key]: value }, setKeys: setKey ? new Set(s.setKeys).add(setKey) : s.setKeys }
    })
  }
  const text = (key: Exclude<keyof FormValues, 'peers' | 'static' | 'reuseRunningAgent' | 'sessionMessaging' | 'kubeAccess' | 'cacheEnabled' | 'env' | 'anyMcpSources' | 'initScripts' | 'agentCommands' | 'compactInstructions' | 'systemAppend' | 'restartPrompt' | 'hooks' | 'startPrompt'>, label: string, extra: { disabled?: boolean; multiline?: boolean; help?: string } = {}) => (
    <TextField
      size="small"
      label={label}
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      error={Boolean(errors[key]) && values[key] !== ''}
      helperText={(values[key] !== '' ? errors[key] : undefined) ?? extra.help}
      fullWidth
      disabled={extra.disabled}
      multiline={extra.multiline}
    />
  )
  const setEnv = (index: number, patch: Partial<{ key: string; value: string }>) => set('env', values.env.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const closePaste = () => {
    setPasteText(null)
    setPasteErrors([])
  }
  /** Applies the paste box text to the env rows; returns the resulting rows, or null (errors shown in the box) when it does not parse. */
  const applyPaste = (): EnvRow[] | null => {
    const merge = mergePaste(pasteText ?? '', values.env)
    if (merge.errors) {
      setPasteErrors(merge.errors)
      return null
    }
    if (merge.rows) set('env', merge.rows)
    closePaste()
    return merge.rows ?? values.env
  }

  const setSource = (index: number, value: string) => set('anyMcpSources', values.anyMcpSources.map((s, i) => (i === index ? value : s)))
  const template = (key: 'compactInstructions' | 'systemAppend' | 'restartPrompt' | 'startPrompt', label: string, surface: Surface, help?: string) => (
    <Box>
      <TemplateEditor label={label} value={values[key]} onChange={(v) => set(key, v)} preview={previewFor(surface)} />
      {errors[key] && values[key] !== '' && <FormHelperText error>{errors[key]}</FormHelperText>}
      {help && <FormHelperText>{help}</FormHelperText>}
    </Box>
  )

  async function submit() {
    let env = values.env
    let keys = setKeys
    if (pasteText !== null && pasteText.trim() !== '') {
      // a paste still in the box counts: apply it as Apply does and send the merged rows, not the stale state
      const merged = applyPaste()
      if (merged === null || merged.some((r) => envKeyError(r.key, merged))) return
      env = merged
      keys = new Set(setKeys).add('env')
    }
    setBusy(true)
    setServerError(null)
    try {
      const body = { name: values.name, spec: toPresetSpec({ ...values, env }, keys) as SessionSpec }
      onSaved(preset ? await updatePreset(preset.id, body) : await createPreset(body))
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dropdown = (key: 'model' | 'effort', label: string, list: string[], emptyLabel: string) => {
    const current = values[key]
    const unavailable = current !== '' && !list.includes(current)
    const labelOf = (o: string) => (unavailable && o === current ? `${o}${NOT_AVAILABLE}` : o)
    const options = unavailable ? [current, ...list] : list
    return (
      <TextField select size="small" label={label} value={current} onChange={(e) => set(key, e.target.value)} fullWidth slotProps={{ select: { displayEmpty: true, renderValue: (v) => (v === '' ? emptyLabel : labelOf(String(v))) } }}>
        <MenuItem value="">{emptyLabel}</MenuItem>
        {options.map((o) => (
          <MenuItem key={o} value={o}>{labelOf(o)}</MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <>
      <DialogTitle>{preset ? `Edit ${preset.name}` : copyOf ? `Copy ${copyOf.name}` : 'New preset'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {serverError && <Alert severity="error" variant="outlined">{serverError}</Alert>}
          {text('name', 'Name', { disabled: preset?.is_default === true })}
          {text('replicas', 'Replicas')}
          {text('maxReplicas', 'Max replicas', { help: 'More than 1 makes the session a hive' })}
          <FormControlLabel control={<Switch checked={values.static} onChange={(e) => set('static', e.target.checked)} />} label="Static (scaling disabled)" />
          {errors.static && <FormHelperText error>{errors.static}</FormHelperText>}
          {meta && meta.models.length > 0 ? dropdown('model', 'Model', meta.models, 'default') : text('model', 'Model')}
          {meta && meta.efforts.length > 0 ? dropdown('effort', 'Effort', meta.efforts, 'model default') : text('effort', 'Effort')}
          <FormControlLabel control={<Switch checked={values.peers} onChange={(e) => set('peers', e.target.checked)} />} label="Peers" />
          {text('workdir', 'Workdir')}
          {text('pvcSize', 'PVC size')}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {values.env.map((row, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField size="small" label={`Env key ${i + 1}`} value={row.key} onChange={(e) => setEnv(i, { key: e.target.value })} error={Boolean(errors.env?.[i])} helperText={errors.env?.[i]} fullWidth />
                <TextField size="small" label={`Env value ${i + 1}`} value={row.value} onChange={(e) => setEnv(i, { value: e.target.value })} fullWidth />
                <IconButton size="small" aria-label={`Remove env ${i + 1}`} onClick={() => set('env', values.env.filter((_, j) => j !== i))}>x</IconButton>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={() => set('env', [...values.env, { key: '', value: '' }])}>Add env</Button>
              <Button size="small" onClick={() => setPasteText('')} disabled={pasteText !== null}>Paste .env</Button>
            </Box>
            {pasteText !== null && (
              <Box role="group" aria-label="Paste .env" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  size="small"
                  label="Paste .env contents"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  error={pasteErrors.length > 0}
                  helperText={pasteErrors.length > 0 ? pasteErrors.map((m) => <span key={m} style={{ display: 'block' }}>{m}</span>) : undefined}
                  multiline
                  minRows={4}
                  fullWidth
                  slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => applyPaste()}>Apply</Button>
                  <Button size="small" onClick={closePaste}>Cancel</Button>
                </Box>
              </Box>
            )}
          </Box>
          {text('anyMcp', 'any-mcp config', { multiline: true })}
          <Box role="group" aria-label="any-mcp plugins" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormLabel>any-mcp plugins</FormLabel>
              <IconButton size="small" aria-label="Add any-mcp plugin" onClick={() => set('anyMcpSources', [...values.anyMcpSources, ''])}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
            {values.anyMcpSources.map((source, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  label={`any-mcp plugin ${i + 1}`}
                  placeholder="github.com/<owner>/<repo>[//<subdir>][?ref=<ref>]"
                  value={source}
                  onChange={(e) => setSource(i, e.target.value)}
                  error={Boolean(errors.anyMcpSources?.[i])}
                  helperText={errors.anyMcpSources?.[i]}
                  fullWidth
                />
                <IconButton size="small" aria-label={`Remove any-mcp plugin ${i + 1}`} onClick={() => set('anyMcpSources', values.anyMcpSources.filter((_, j) => j !== i))}>x</IconButton>
              </Box>
            ))}
            <FormHelperText>Plugin sources, a repo or a dir in a repo at a git ref: github.com/&lt;owner&gt;/&lt;repo&gt;[//&lt;subdir&gt;][?ref=&lt;ref&gt;] or git::https://&lt;host&gt;/&lt;path&gt;[//&lt;subdir&gt;][?ref=&lt;ref&gt;]</FormHelperText>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <EntryList label="Init script" entries={values.initScripts} onChange={(v) => set('initScripts', v)} preview={previewFor('init_script')} />
            {errors.initScripts?.map((m, i) => (m ? <FormHelperText key={i} error>{m}</FormHelperText> : null))}
            <FormHelperText>Runs once when a session starts, in the shared workdir; agents can read and edit it; edits apply to the next session.</FormHelperText>
          </Box>
          {template('startPrompt', 'Start prompt', 'web_chat_start', 'Sent before the session, webhook, chat or cron prompt, in one message.')}
          {text('maxAttempts', 'Max attempts')}
          {text('autoCompact', 'Auto-compact percent')}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {text('cpuRequest', 'CPU request')}
            {text('cpuLimit', 'CPU limit')}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {text('memRequest', 'Memory request')}
            {text('memLimit', 'Memory limit')}
          </Box>
          {text('hookUrl', 'Pre-discard webhook URL')}
          {hive && text('leaderLease', 'Leader lease seconds', { help: 'Hive leader lease, 60 to 604800 seconds' })}
          {text('autocloseAfter', 'Autoclose after seconds', { help: 'Counts from creation, with a 300 s minimum' })}
          <Box>
            <FormControlLabel control={<Switch checked={values.reuseRunningAgent} onChange={(e) => set('reuseRunningAgent', e.target.checked)} />} label="Reuse running agent" />
            <FormHelperText>Webhook and schedule events for the same item go to the agent still running for it instead of starting a new one</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={values.sessionMessaging} onChange={(e) => set('sessionMessaging', e.target.checked)} />} label="Superleader" />
            <FormHelperText>superleader: can message the leaders of all sessions</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={values.kubeAccess} onChange={(e) => set('kubeAccess', e.target.checked)} />} label="Kubernetes access" disabled={!kubeAccessAvailable} />
            <FormHelperText>{meta && !kubeAccessAvailable ? 'Not configured on this orchestrator' : 'Agents get full read-write access to every namespace and resource'}</FormHelperText>
          </Box>
          <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }} disabled={!cacheAvailable}>
            <FormLabel component="legend">Workspace cache</FormLabel>
            <FormControlLabel control={<Switch checked={values.cacheEnabled} onChange={(e) => set('cacheEnabled', e.target.checked)} />} label="Cache the workspace in S3" disabled={!cacheAvailable} />
            {meta && !cacheAvailable && <FormHelperText>Workspace cache is not configured on the orchestrator</FormHelperText>}
            <TextField
              size="small"
              label="Cache key"
              placeholder="derived from the preset"
              value={values.cacheKey}
              onChange={(e) => set('cacheKey', e.target.value)}
              error={Boolean(errors.cacheKey)}
              helperText={errors.cacheKey ?? 'Same key, same cache: sessions sharing a key share the workspace (last save wins)'}
              disabled={!cacheAvailable || !values.cacheEnabled}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              label="Exclude (one glob per line)"
              value={values.cacheExclude}
              onChange={(e) => set('cacheExclude', e.target.value)}
              error={Boolean(errors.cacheExclude)}
              helperText={errors.cacheExclude}
              disabled={!cacheAvailable || !values.cacheEnabled}
              multiline
              minRows={2}
              fullWidth
            />
          </Box>
          {text('compactIdle', 'Auto-compact idle seconds')}
          {template('compactInstructions', 'Auto-compact instructions', 'preset_text')}
          {text('compactMinTokens', 'Auto-compact min context tokens')}
          {template('systemAppend', 'System append', 'preset_text')}
          {template('restartPrompt', 'Restart continue prompt', 'preset_text')}
          {text('turnStall', 'Turn stall seconds')}
          {text('maxRestarts', 'Max restarts')}
          {text('turnMax', 'Turn max seconds')}
          <FormControl size="small" fullWidth>
            <InputLabel id="agent-commands-label">Agent commands</InputLabel>
            <Select
              labelId="agent-commands-label"
              label="Agent commands"
              multiple
              value={values.agentCommands}
              onChange={(e) => set('agentCommands', typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              renderValue={(v) => v.join(', ')}
            >
              {AGENT_COMMANDS.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {text('permAllow', 'Permissions allow', { help: 'Comma separated' })}
          {text('permDeny', 'Permissions deny', { help: 'Comma separated' })}
          {meta && (
            <Box>
              <HooksEditor value={hooksOf(values.hooks)} onChange={(v) => set('hooks', v === null ? '' : JSON.stringify(v, null, 2))} events={meta.hook_events} />
              <FormHelperText>Command hooks run with the agent's credentials.</FormHelperText>
            </Box>
          )}
          {text('mcpServers', 'MCP servers', { multiline: true })}
          {text('plugins', 'Plugins', { multiline: true })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" disabled={invalid || busy} onClick={() => void submit()}>{editing ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </>
  )
}

/**
 * @param props see PresetFormProps.
 * @returns the dialog element; its body remounts on every open so the form starts fresh.
 */
export function PresetForm({ open, ...rest }: PresetFormProps) {
  return (
    <Dialog open={open} onClose={rest.onClose} fullWidth maxWidth="sm" aria-label={rest.preset ? 'Edit preset' : rest.copyOf ? 'Copy preset' : 'New preset'}>
      <FormBody {...rest} />
    </Dialog>
  )
}
