/**
 * Structured editor for a session spec's `hooks`: one section per event that has hooks, an "Add hook" control, typed
 * fields per hook (command or webhook, the only types the wrapper supports), client validation and a Raw JSON mode
 * over the same state. `value` null is "unset" and stays distinct from `{}`: only edits change it.
 *
 * A webhook `secret` is shown masked (password field). The orchestrator stores and echoes it verbatim, so an
 * untouched hook round-trips the stored value; the field never receives a placeholder that could overwrite it.
 */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type JSX } from 'react'
import { HOOK_ACTIONS_MAX, type HookAction, type HookEventInfo, type Hooks } from './types'
import { validateHooks } from './validate'

export interface HooksEditorProps {
  value: Hooks | null
  onChange: (value: Hooks | null) => void
  /** The hook events the orchestrator accepts, from `/meta.hook_events`. */
  events: HookEventInfo[]
  disabled?: boolean
}

const native = { select: { native: true } } as const
const COMMON_KEYS = ['timeout_seconds', 'blocking', 'on_error', 'matcher', 'interval_seconds', 'when'] as const

/** `action` with `key` set to `value`, or without the key when `value` is undefined. */
function withField(action: HookAction, key: string, value: unknown): HookAction {
  const next = { ...action } as Record<string, unknown>
  if (value === undefined) delete next[key]
  else next[key] = value
  return next as unknown as HookAction
}

const numberOrUndefined = (text: string): number | undefined => (text.trim() === '' || Number.isNaN(Number(text)) ? undefined : Number(text))

/** Key/value rows of a string map (env, headers) in the same row pattern as the preset env editor. */
function MapRows({ name, value, onChange, disabled }: { name: string; value: Record<string, string> | null | undefined; onChange: (v: Record<string, string> | undefined) => void; disabled: boolean }): JSX.Element {
  const rows = Object.entries(value ?? {})
  const commit = (next: [string, string][]) => onChange(next.length === 0 ? undefined : Object.fromEntries(next))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map(([k, v], i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label={`${name} key ${i + 1}`} value={k} disabled={disabled} fullWidth onChange={(e) => commit(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <TextField size="small" label={`${name} value ${i + 1}`} value={v} disabled={disabled} fullWidth onChange={(e) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <IconButton size="small" aria-label={`Remove ${name.toLowerCase()} ${i + 1}`} disabled={disabled} onClick={() => commit(rows.filter((_, j) => j !== i))}>
            x
          </IconButton>
        </Box>
      ))}
      <Box>
        <Button size="small" disabled={disabled || rows.some(([k]) => k === '')} onClick={() => commit([...rows, ['', '']])}>{`Add ${name.toLowerCase()}`}</Button>
      </Box>
    </Box>
  )
}

function ActionFields({ action, info, errors, disabled, onChange }: { action: HookAction; info: HookEventInfo | undefined; errors: string[]; disabled: boolean; onChange: (a: HookAction) => void }): JSX.Element {
  const set = (key: string, value: unknown) => onChange(withField(action, key, value))
  const text = (key: string, label: string, value: string | null | undefined, extra: object = {}) => (
    <TextField size="small" label={label} value={value ?? ''} disabled={disabled} fullWidth onChange={(e) => set(key, e.target.value === '' ? undefined : e.target.value)} {...extra} />
  )
  const num = (key: 'timeout_seconds' | 'interval_seconds' | 'retries', label: string, value: number | null | undefined) => (
    <TextField size="small" type="number" label={label} value={value ?? ''} disabled={disabled} onChange={(e) => set(key, numberOrUndefined(e.target.value))} />
  )
  const switchType = (type: string) => {
    if (type === action.type) return
    const common = Object.fromEntries(COMMON_KEYS.filter((k) => action[k] != null).map((k) => [k, action[k]]))
    onChange((type === 'webhook' ? { type: 'webhook', url: '', ...common } : { type: 'command', run: '', ...common }) as HookAction)
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField select size="small" label="Type" value={action.type} disabled={disabled} slotProps={native} onChange={(e) => switchType(e.target.value)}>
        <option value="command">command</option>
        <option value="webhook">webhook</option>
      </TextField>
      {action.type === 'command' ? (
        <>
          <TextField size="small" label="Run" value={action.run} disabled={disabled} multiline minRows={2} fullWidth onChange={(e) => onChange({ ...action, run: e.target.value })} />
          <MapRows name="Env" value={action.env} disabled={disabled} onChange={(v) => set('env', v)} />
        </>
      ) : (
        <>
          <TextField size="small" label="URL" value={action.url} disabled={disabled} fullWidth onChange={(e) => onChange({ ...action, url: e.target.value })} />
          {text('secret', 'Secret', action.secret, { type: 'password', autoComplete: 'off' })}
          <MapRows name="Header" value={action.headers} disabled={disabled} onChange={(v) => set('headers', v)} />
          {num('retries', 'Retries', action.retries)}
        </>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {num('timeout_seconds', 'Timeout seconds', action.timeout_seconds)}
        <FormControlLabel control={<Switch checked={action.blocking === true} disabled={disabled} onChange={(e) => set('blocking', e.target.checked ? true : undefined)} />} label="Blocking" />
        <TextField select size="small" label="On error" value={action.on_error ?? ''} disabled={disabled} slotProps={native} onChange={(e) => set('on_error', e.target.value === '' ? undefined : e.target.value)}>
          <option value="" />
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </TextField>
        {info?.supports_matcher && text('matcher', 'Matcher', action.matcher)}
        {info?.supports_interval && num('interval_seconds', 'Interval seconds', action.interval_seconds)}
        {info?.supports_when && (
          <TextField select size="small" label="When" value={action.when ?? ''} disabled={disabled} slotProps={native} onChange={(e) => set('when', e.target.value === '' ? undefined : e.target.value)}>
            <option value="" />
            <option value="busy">busy</option>
            <option value="always">always</option>
          </TextField>
        )}
      </Box>
      {errors.map((m) => (
        <Typography key={m} variant="caption" color="error">
          {m}
        </Typography>
      ))}
    </Box>
  )
}

function RawJson({ value, onChange, disabled }: { value: Hooks | null; onChange: (v: Hooks | null) => void; disabled: boolean }): JSX.Element {
  const [text, setText] = useState(value === null ? '' : JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)
  const edit = (next: string) => {
    setText(next)
    if (next.trim() === '') {
      setError(null)
      onChange(null)
      return
    }
    try {
      const parsed: unknown = JSON.parse(next)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('hooks must be a JSON object')
      setError(null)
      onChange(parsed as Hooks)
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField size="small" label="Hooks JSON" value={text} disabled={disabled} multiline minRows={6} fullWidth onChange={(e) => edit(e.target.value)} />
      {error && (
        <Alert severity="error" variant="outlined">
          {error}
        </Alert>
      )}
    </Box>
  )
}

export default function HooksEditor({ value, onChange, events, disabled = false }: HooksEditorProps): JSX.Element {
  const [raw, setRaw] = useState(false)
  const [pick, setPick] = useState(events[0]?.name ?? '')
  const known = new Map(events.map((e) => [e.name, e]))
  const errors = validateHooks(value, events)
  const hooks = value ?? {}
  const count = (hooks[pick] ?? []).length

  const setActions = (event: string, actions: HookAction[]) => {
    const next = { ...hooks }
    if (actions.length === 0) delete next[event]
    else next[event] = actions
    onChange(next)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2">Hooks</Typography>
        <Button size="small" onClick={() => setRaw(!raw)}>
          {raw ? 'Form' : 'Raw JSON'}
        </Button>
      </Box>
      {raw ? (
        <RawJson value={value} onChange={onChange} disabled={disabled} />
      ) : (
        <>
          {Object.entries(hooks).map(([event, actions]) => (
            <Box key={event} component="fieldset" aria-label={event} sx={{ display: 'flex', flexDirection: 'column', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, m: 0 }}>
              <Typography variant="caption" component="legend">
                {event}
              </Typography>
              {errors.filter((e) => e.path === event).map((e) => (
                <Typography key={e.message} variant="caption" color="error">
                  {e.message}
                </Typography>
              ))}
              {actions.map((action, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <ActionFields
                      action={action}
                      info={known.get(event)}
                      disabled={disabled}
                      errors={errors.filter((e) => e.path.startsWith(`${event}.${i}.`)).map((e) => `${e.path.slice(`${event}.${i}.`.length)}: ${e.message}`)}
                      onChange={(a) => setActions(event, actions.map((x, j) => (j === i ? a : x)))}
                    />
                  </Box>
                  <IconButton size="small" aria-label={`Remove hook ${event} ${i + 1}`} disabled={disabled} onClick={() => setActions(event, actions.filter((_, j) => j !== i))}>
                    x
                  </IconButton>
                </Box>
              ))}
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField select size="small" label="Hook event" value={pick} disabled={disabled} slotProps={native} onChange={(e) => setPick(e.target.value)}>
              {events.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </TextField>
            <Button size="small" disabled={disabled || pick === '' || count >= HOOK_ACTIONS_MAX} onClick={() => setActions(pick, [...(hooks[pick] ?? []), { type: 'command', run: '' }])}>
              Add hook
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}
