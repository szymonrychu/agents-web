/**
 * Structured editor for a session spec's `wrapper.plugins`: a marketplaces list, an install list (plugin, marketplace
 * picked from the listed ones plus the built-in claude-plugins-official, scope, required), an optional disable list,
 * and a Raw JSON mode over the same value. `value` null is "unset"; an edit that leaves nothing sets it back to null.
 * Inline errors are reported through `onInvalid` so the form can block Save, as HooksEditor does.
 */
import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { components } from '../api/schema'
import { SOURCE_KINDS, formatSource, parseSource, sourceError, type SourceKind, type SourceParts } from './marketplaceSource'

type Plugins = components['schemas']['Plugins']
type Marketplace = components['schemas']['Marketplace']
type PluginInstall = components['schemas']['PluginInstall']
/** The generated Plugins type plus the wrapper's `disable` list. */
export type PluginsValue = Plugins & { disable?: string[] | null }

export const BUILT_IN_MARKETPLACE = 'claude-plugins-official'
const SCOPES = ['user', 'project', 'local'] as const

const native = { select: { native: true } } as const
const row = { display: 'flex', gap: 1, alignItems: 'flex-start' } as const

interface MarketRow extends SourceParts {
  name: string
}

const toRow = (m: Marketplace): MarketRow => ({ name: m.name, ...parseSource(m.source) })
const fromRow = (r: MarketRow): Marketplace => ({ name: r.name, source: formatSource(r) })

const splitPlugin = (plugin: string) => {
  const at = plugin.lastIndexOf('@')
  return at === -1 ? { name: plugin, market: '' } : { name: plugin.slice(0, at), market: plugin.slice(at + 1) }
}

/** `value` with the given lists replaced; empty lists are dropped and an empty result is null. */
function build(value: PluginsValue | null, patch: { marketplaces?: Marketplace[]; install?: PluginInstall[]; disable?: string[] }): PluginsValue | null {
  const next: Record<string, unknown> = { ...value, ...patch }
  for (const key of ['marketplaces', 'install', 'disable']) {
    if (Array.isArray(next[key]) && (next[key] as unknown[]).length === 0) delete next[key]
  }
  return Object.keys(next).length === 0 ? null : (next as PluginsValue)
}

function marketRowError(r: MarketRow, i: number, rows: MarketRow[]): string | null {
  if (r.name.trim() === '') return 'name is required'
  if (rows.some((o, j) => j !== i && o.name === r.name)) return `duplicate marketplace name "${r.name}"`
  return sourceError(r)
}

const SOURCE_LABEL: Record<SourceKind, string> = { github: 'repo', git: 'git URL', url: 'url', directory: 'path' }
const SOURCE_HELP: Record<SourceKind, string> = {
  github: 'owner/repo', git: 'https://host/path.git', url: 'https://host/marketplace.json', directory: '/path/in/the/agent',
}

function Section({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children?: React.ReactNode }): JSX.Element {
  return (
    <Box role="group" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption">{title}</Typography>
        <IconButton size="small" aria-label={addLabel} onClick={onAdd}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>
      {children}
    </Box>
  )
}

function FormEditor({ value, onChange, onInvalid }: { value: PluginsValue | null; onChange: (v: PluginsValue | null) => void; onInvalid: (m: string | null) => void }): JSX.Element {
  const [rows, setRows] = useState<MarketRow[]>(() => (value?.marketplaces ?? []).map(toRow))
  const install = value?.install ?? []
  const disable = value?.disable ?? []
  const listed = rows.map((r) => r.name).filter((n) => n !== '')
  const known = [BUILT_IN_MARKETPLACE, ...listed.filter((n) => n !== BUILT_IN_MARKETPLACE)]

  const marketErrors = rows.map((r, i) => marketRowError(r, i, rows))
  const installErrors = install.map((p) => {
    const { name, market } = splitPlugin(p.plugin)
    if (name.trim() === '') return 'plugin name is required'
    if (!known.includes(market)) return `marketplace "${market}" is not listed`
    return null
  })
  const disableErrors = disable.map((d) => (/^[^@\s]+@[^@\s]+$/.test(d) ? null : 'must look like name@marketplace'))
  const first = [...marketErrors, ...installErrors, ...disableErrors].find((e) => e !== null) ?? null
  useEffect(() => onInvalid(first), [first, onInvalid])

  const setRowsAndEmit = (next: MarketRow[]) => {
    setRows(next)
    onChange(build(value, { marketplaces: next.map(fromRow) }))
  }
  const patchRow = (i: number, patch: Partial<MarketRow>) => setRowsAndEmit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setInstall = (next: PluginInstall[]) => onChange(build(value, { install: next }))
  const patchInstall = (i: number, patch: Partial<PluginInstall>) => setInstall(install.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setDisable = (next: string[]) => onChange(build(value, { disable: next }))
  const err = (m: string | null | undefined) => (m ? <FormHelperText error>{m}</FormHelperText> : null)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Section title="Marketplaces" addLabel="Add marketplace" onAdd={() => setRowsAndEmit([...rows, { name: '', kind: 'github', value: '', ref: '' }])}>
        {rows.map((r, i) => (
          <Box key={i}>
            <Box sx={row}>
              <TextField size="small" label={`Marketplace name ${i + 1}`} value={r.name} onChange={(e) => patchRow(i, { name: e.target.value })} fullWidth />
              <TextField select size="small" label={`Marketplace type ${i + 1}`} value={r.kind} slotProps={native} onChange={(e) => patchRow(i, { kind: e.target.value as SourceKind })}>
                {SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </TextField>
              <TextField size="small" label={`Marketplace ${SOURCE_LABEL[r.kind]} ${i + 1}`} placeholder={SOURCE_HELP[r.kind]} value={r.value} onChange={(e) => patchRow(i, { value: e.target.value })} fullWidth />
              {(r.kind === 'github' || r.kind === 'git') && (
                <TextField size="small" label={`Marketplace ref ${i + 1}`} placeholder="branch or tag" value={r.ref} onChange={(e) => patchRow(i, { ref: e.target.value })} />
              )}
              <IconButton size="small" aria-label={`Remove marketplace ${i + 1}`} onClick={() => setRowsAndEmit(rows.filter((_, j) => j !== i))}>x</IconButton>
            </Box>
            {err(marketErrors[i])}
          </Box>
        ))}
      </Section>
      <Section title="Install" addLabel="Add install" onAdd={() => setInstall([...install, { plugin: `@${BUILT_IN_MARKETPLACE}` }])}>
        {install.map((p, i) => {
          const { name, market } = splitPlugin(p.plugin)
          const options = known.includes(market) || market === '' ? known : [...known, market]
          return (
            <Box key={i}>
              <Box sx={row}>
                <TextField size="small" label={`Install plugin ${i + 1}`} value={name} onChange={(e) => patchInstall(i, { plugin: `${e.target.value}@${market}` })} fullWidth />
                <TextField select size="small" label={`Install marketplace ${i + 1}`} value={market} slotProps={native} onChange={(e) => patchInstall(i, { plugin: `${name}@${e.target.value}` })}>
                  {options.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </TextField>
                <TextField select size="small" label={`Install scope ${i + 1}`} value={p.scope ?? ''} slotProps={native} onChange={(e) => patchInstall(i, { scope: e.target.value === '' ? undefined : (e.target.value as (typeof SCOPES)[number]) })}>
                  <option value="" />
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </TextField>
                <FormControlLabel
                  control={<Switch checked={p.required !== false} onChange={(e) => patchInstall(i, { required: e.target.checked ? undefined : false })} slotProps={{ input: { 'aria-label': `Install required ${i + 1}` } }} />}
                  label="Required"
                />
                <IconButton size="small" aria-label={`Remove install ${i + 1}`} onClick={() => setInstall(install.filter((_, j) => j !== i))}>x</IconButton>
              </Box>
              {err(installErrors[i])}
            </Box>
          )
        })}
      </Section>
      <Section title="Disable" addLabel="Add disable" onAdd={() => setDisable([...disable, ''])}>
        {disable.map((d, i) => (
          <Box key={i} sx={row}>
            <TextField size="small" label={`Disable plugin ${i + 1}`} placeholder="name@marketplace" value={d} error={disableErrors[i] !== null && d !== ''} helperText={d !== '' ? disableErrors[i] : undefined} onChange={(e) => setDisable(disable.map((x, j) => (j === i ? e.target.value : x)))} fullWidth />
            <IconButton size="small" aria-label={`Remove disable ${i + 1}`} onClick={() => setDisable(disable.filter((_, j) => j !== i))}>x</IconButton>
          </Box>
        ))}
      </Section>
    </Box>
  )
}

function RawJson({ value, onChange, onInvalid }: { value: PluginsValue | null; onChange: (v: PluginsValue | null) => void; onInvalid: (m: string | null) => void }): JSX.Element {
  const [text, setText] = useState(value === null ? '' : JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => onInvalid(null), [onInvalid])
  const edit = (next: string) => {
    setText(next)
    if (next.trim() === '') {
      setError(null)
      onInvalid(null)
      onChange(null)
      return
    }
    try {
      const parsed: unknown = JSON.parse(next)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('plugins must be a JSON object')
      setError(null)
      onInvalid(null)
      onChange(parsed as PluginsValue)
    } catch (e) {
      const message = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      setError(message)
      onInvalid(message)
    }
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField size="small" label="Plugins JSON" value={text} multiline minRows={6} fullWidth onChange={(e) => edit(e.target.value)} />
      {error && <Alert severity="error" variant="outlined">{error}</Alert>}
    </Box>
  )
}

export interface PluginsEditorProps {
  value: PluginsValue | null
  onChange: (v: PluginsValue | null) => void
  onInvalid?: (message: string | null) => void
}

export default function PluginsEditor({ value, onChange, onInvalid = () => {} }: PluginsEditorProps): JSX.Element {
  const [raw, setRaw] = useState(false)
  const [rawInvalid, setRawInvalid] = useState(false)
  const latest = useRef(onInvalid)
  useEffect(() => {
    latest.current = onInvalid
  })
  const report = useCallback((m: string | null) => {
    setRawInvalid(m !== null)
    latest.current(m)
  }, [])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2">Plugins</Typography>
        <Button size="small" disabled={raw && rawInvalid} aria-label={raw ? 'Plugins form' : 'Plugins raw JSON'} onClick={() => setRaw(!raw)}>
          {raw ? 'Form' : 'Raw JSON'}
        </Button>
      </Box>
      {raw ? <RawJson value={value} onChange={onChange} onInvalid={report} /> : <FormEditor value={value} onChange={onChange} onInvalid={report} />}
    </Box>
  )
}
