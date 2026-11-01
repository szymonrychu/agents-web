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
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import { parseDotenv } from '../sessions/dotenv'
import { createPreset, getMeta, setPresetSecret, updatePreset } from '../api/client'
import EntryList from '../common/EntryList'
import TemplateEditor from '../editor/TemplateEditor'
import { previewFor, type Surface } from '../sessions/previewFor'
import HooksEditor from '../hooks/HooksEditor'
import type { Hooks } from '../hooks/types'
import PluginsEditor, { type PluginsValue } from '../plugins/PluginsEditor'
import type { SessionSpec, Meta, PresetIn, PresetView } from '../api/client'
import { CACHE_KEY_RESERVED_PREFIX, copyName, envKeyError, envRow, envValueError, setKeyOf, stateFromPreset, toPresetSpec, validate } from '../sessions/sessionSpecForm'
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

const hooksOf = (text: string): Hooks | null => {
  try {
    const v: unknown = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Hooks) : null
  } catch {
    return null
  }
}

const pluginsOf = (text: string): PluginsValue | null => {
  try {
    const v: unknown = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as PluginsValue) : null
  } catch {
    return null
  }
}

const stored = (p?: PresetView) => (p?.spec ?? {}) as Partial<SessionSpec>

/** The copy's spec: preset-derived cache keys belong to the source, the copy derives its own. */
function copiedSpec(source: PresetView): Partial<SessionSpec> {
  const spec = stored(source)
  const { restore_key: restore, save_key: save } = spec.cache ?? {}
  if (!restore?.startsWith(CACHE_KEY_RESERVED_PREFIX) && !save?.startsWith(CACHE_KEY_RESERVED_PREFIX)) return spec
  return { ...spec, cache: { ...spec.cache, restore_key: null, save_key: null, exclude: spec.cache?.exclude ?? [] } }
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
    if (existing) {
      existing.value = pair.value
      if (existing.protected) existing.replacing = true
    }
    else rows.push(envRow(pair.key, pair.value))
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
  // a preset-level flag, not part of the spec: copies keep the source value
  const [superleaderManageable, setSuperleaderManageable] = useState(() => (preset ?? copyOf)?.superleader_manageable ?? false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hooksInvalid, setHooksInvalid] = useState(false)
  const [pluginsInvalid, setPluginsInvalid] = useState(false)
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

  const errors = validate(values, meta)
  const cacheAvailable = meta?.cache.available === true
  // the restore key's last rendered preview, kept with its template so a stale one never shows
  const [restoreRendered, setRestoreRendered] = useState<{ template: string; rendered: string } | null>(null)
  const previewRestoreKey = async (template: string) => {
    const result = await previewFor('archive_name')(template)
    setRestoreRendered(result.rendered === null ? null : { template, rendered: result.rendered })
    return result
  }
  const dockerAvailable = meta?.docker.available === true
  const kubeAccessAvailable = meta?.kube_access.available === true
  const permissionModes = meta?.permission_modes ?? [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }]
  const invalid = Object.keys(errors).length > 0 || hooksInvalid || pluginsInvalid
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setState((s) => {
      touched.current.add(key)
      const setKey = setKeyOf(key)
      return { values: { ...s.values, [key]: value }, setKeys: setKey ? new Set(s.setKeys).add(setKey) : s.setKeys }
    })
  }
  const text = (key: Exclude<keyof FormValues, 'peers' | 'static' | 'reuseRunningAgent' | 'sessionMessaging' | 'kubeAccess' | 'docker' | 'cacheEnabled' | 'env' | 'anyMcpSources' | 'initScripts' | 'agentCommands' | 'compactInstructions' | 'systemAppend' | 'restartPrompt' | 'hooks' | 'plugins' | 'startPrompt'>, label: string, extra: { disabled?: boolean; multiline?: boolean; help?: string } = {}) => (
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
  const setEnv = (index: number, patch: Partial<EnvRow>) => set('env', values.env.map((r, i) => (i === index ? { ...r, ...patch } : r)))

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
    let secretsSaved = false
    try {
      if (preset) {
        // a saved preset takes a replaced protected value through the secret route, so the spec update never carries it
        for (const r of env.filter((r) => r.protected && r.stored && r.replacing)) {
          await setPresetSecret(preset.id, r.key, r.value)
          secretsSaved = true
        }
        env = env.map((r) => (r.protected && r.stored && r.replacing ? { ...r, replacing: false, value: '' } : r))
      }
      const body = { name: values.name, superleader_manageable: superleaderManageable, spec: toPresetSpec({ ...values, env }, keys) as PresetIn['spec'] }
      onSaved(preset ? await updatePreset(preset.id, body) : await createPreset(body))
    } catch (e) {
      setServerError((e instanceof Error ? e.message : String(e)) + (secretsSaved ? ' (a replaced protected value was already saved)' : ''))
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
              <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {row.legacy && (
                  <Alert severity="warning" variant="outlined">
                    {row.key || `Variable ${i + 1}`} is stored in the old plain-string format, which the server no longer accepts. Saving converts it to a plain variable.
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <TextField size="small" label={`Env key ${i + 1}`} value={row.key} onChange={(e) => setEnv(i, { key: e.target.value })} error={Boolean(envKeyError(row.key, values.env))} helperText={envKeyError(row.key, values.env) ?? (row.stored && copyOf ? 'Protected value not copied' : undefined)} disabled={row.stored} fullWidth sx={{ flex: '1 1 12rem' }} />
                  {row.stored && !row.replacing ? (
                    <Box sx={{ flex: '1 1 12rem', display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
                      <Typography variant="body2">{row.isSet ? `set, updated ${row.updatedAt ?? 'unknown'}` : 'unset'}</Typography>
                      <Button size="small" aria-label={`Replace value ${i + 1}`} onClick={() => setEnv(i, { replacing: true, value: '' })}>Replace value</Button>
                    </Box>
                  ) : (
                    <Box sx={{ flex: '1 1 12rem', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <TextField
                        size="small"
                        label={row.stored ? `New value ${i + 1}` : `Env value ${i + 1}`}
                        type={row.protected ? 'password' : 'text'}
                        autoComplete="off"
                        value={row.value}
                        onChange={(e) => setEnv(i, { value: e.target.value })}
                        error={Boolean(envValueError(row))}
                        helperText={envValueError(row)}
                        fullWidth
                      />
                      {row.stored && <Button size="small" aria-label={`Cancel replace ${i + 1}`} onClick={() => setEnv(i, { replacing: false, value: '' })}>Cancel</Button>}
                    </Box>
                  )}
                  <FormControlLabel control={<Switch size="small" checked={row.protected} disabled={row.stored} onChange={(e) => setEnv(i, { protected: e.target.checked, expand: e.target.checked ? false : row.expand })} slotProps={{ input: { 'aria-label': `Protected ${i + 1}` } }} />} label="Protected" />
                  <FormControlLabel control={<Switch size="small" checked={row.expand} disabled={row.protected} onChange={(e) => setEnv(i, { expand: e.target.checked })} slotProps={{ input: { 'aria-label': `Expand ${i + 1}` } }} />} label="Expand" />
                  {!row.protected && <Button size="small" aria-label={`Mark protected ${i + 1}`} onClick={() => setEnv(i, { protected: true, expand: false })}>Mark protected</Button>}
                  <IconButton size="small" aria-label={`Remove env ${i + 1}`} onClick={() => set('env', values.env.filter((_, j) => j !== i))}>x</IconButton>
                </Box>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={() => set('env', [...values.env, envRow()])}>Add env</Button>
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
            <TextField select size="small" label="Permission mode" value={values.permissionMode || 'bypassPermissions'} onChange={(e) => set('permissionMode', e.target.value)} fullWidth>
              {permissionModes.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <FormHelperText>Allow all runs every action; Auto has a classifier review actions, safer for sessions that read untrusted text</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={values.reuseRunningAgent} onChange={(e) => set('reuseRunningAgent', e.target.checked)} />} label="Reuse running agent" />
            <FormHelperText>Webhook and schedule events for the same item go to the agent still running for it instead of starting a new one</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={values.sessionMessaging} onChange={(e) => set('sessionMessaging', e.target.checked)} />} label="Superleader" />
            <FormHelperText>superleader: can message the leaders of all sessions</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={superleaderManageable} onChange={(e) => setSuperleaderManageable(e.target.checked)} />} label="Superleader can manage" />
            <FormHelperText>The superleader sees this preset and the sessions, webhooks, schedules and chats that use it, and can start, stop and edit them</FormHelperText>
          </Box>
          <Box>
            <FormControlLabel control={<Switch checked={values.kubeAccess} onChange={(e) => set('kubeAccess', e.target.checked)} />} label="Kubernetes access" disabled={!kubeAccessAvailable} />
            <FormHelperText>{meta && !kubeAccessAvailable ? 'Not configured on this orchestrator' : 'Agents get full read-write access to every namespace and resource'}</FormHelperText>
          </Box>
          {(dockerAvailable || values.docker) && (
            <Box>
              <FormControlLabel control={<Switch checked={values.docker} onChange={(e) => set('docker', e.target.checked)} />} label="Docker (privileged sidecar)" disabled={!dockerAvailable} />
              <FormHelperText>{values.docker ? 'Runs a privileged container in the agent pod (Docker-in-Docker): the agent gets root-equivalent control of its node. Enable only for trusted presets.' : 'Docker daemon next to the agent for docker build, docker run and kind'}</FormHelperText>
              {values.docker && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                  {text('dockerStorage', 'Docker storage', { help: meta ? `Default ${meta.docker.storage}, max ${meta.docker.max_storage}` : undefined })}
                  {text('dockerCpu', 'Docker CPU limit', { help: meta ? `Max ${meta.docker.max_cpu}` : undefined })}
                  {text('dockerMemory', 'Docker memory limit', { help: meta ? `Max ${meta.docker.max_memory}` : undefined })}
                </Box>
              )}
            </Box>
          )}
          <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }} disabled={!cacheAvailable}>
            <FormLabel component="legend">Workspace cache</FormLabel>
            <FormControlLabel control={<Switch checked={values.cacheEnabled} onChange={(e) => set('cacheEnabled', e.target.checked)} />} label="Cache the workspace in S3" disabled={!cacheAvailable} />
            {meta && !cacheAvailable && <FormHelperText>Workspace cache is not configured on the orchestrator</FormHelperText>}
            <FormControlLabel control={<Switch checked={values.cacheDerive} onChange={(e) => set('cacheDerive', e.target.checked)} />} label="Derive the keys from the preset" disabled={!cacheAvailable || !values.cacheEnabled} />
            {values.cacheEnabled && !values.cacheDerive && (
              <>
                <Box>
                  <TemplateEditor label="Restore key" value={values.cacheRestoreKey} onChange={(v) => set('cacheRestoreKey', v)} preview={previewRestoreKey} disabled={!cacheAvailable} />
                  {errors.cacheRestoreKey && <FormHelperText error>{errors.cacheRestoreKey}</FormHelperText>}
                  {values.cacheRestoreKey === '' && <FormHelperText>Empty: fresh start, nothing is restored</FormHelperText>}
                  {restoreRendered?.template === values.cacheRestoreKey && restoreRendered.rendered.endsWith('/') && <FormHelperText>Restores the newest archive under this prefix</FormHelperText>}
                </Box>
                <Box>
                  <TemplateEditor label="Save key" value={values.cacheSaveKey} onChange={(v) => set('cacheSaveKey', v)} preview={previewFor('archive_name')} disabled={!cacheAvailable} />
                  {errors.cacheSaveKey && <FormHelperText error>{errors.cacheSaveKey}</FormHelperText>}
                  {values.cacheSaveKey === '' && <FormHelperText>Empty: restore only, nothing is saved</FormHelperText>}
                </Box>
              </>
            )}
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
              <HooksEditor value={hooksOf(values.hooks)} onChange={(v) => set('hooks', v === null ? '' : JSON.stringify(v, null, 2))} events={meta.hook_events} onInvalid={(m) => setHooksInvalid(m !== null)} />
              <FormHelperText>Command hooks run with the agent's credentials.</FormHelperText>
            </Box>
          )}
          {text('mcpServers', 'MCP servers', { multiline: true })}
          <PluginsEditor value={pluginsOf(values.plugins)} onChange={(v) => set('plugins', v === null ? '' : JSON.stringify(v, null, 2))} onInvalid={(m) => setPluginsInvalid(m !== null)} />
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
