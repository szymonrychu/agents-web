/**
 * Allow/deny filters editor for one endpoint type. Controlled: `value` in, `onChange` out.
 * The field list is the backend's (`meta.filter_fields[type]`); regex is never checked here,
 * because the backend matches with RE2 and its answer is authoritative.
 */
import { useEffect, useState } from 'react'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { FilterRule, Filters } from './api'

export const EMPTY_FILTERS: Filters = { allow: [], deny: [] }

export interface FiltersEditorProps {
  type: string
  fields: string[]
  value: Filters
  onChange: (next: Filters) => void
}

type Side = keyof Filters
const SECTIONS: { side: Side; title: string; add: string }[] = [
  { side: 'allow', title: 'Allow (every rule must match)', add: 'Add allow rule' },
  { side: 'deny', title: 'Deny (any matching rule ignores the event)', add: 'Add deny rule' },
]
const MATCHES: FilterRule['match'][] = ['equals', 'regex']
const RE2_HINT = 'The backend uses RE2 (no lookaround or backreferences); unanchored, use ^...$ to anchor'

const splitLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '')
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

function valuesHint(type: string, rule: FilterRule) {
  const base = type === 'grafana-alert' && rule.field === 'labels'
    ? `${rule.match === 'regex' ? 'key=regex' : 'key=value'}, one per line`
    : 'One value per line'
  return rule.match === 'regex' ? `${base}. ${RE2_HINT}` : base
}

/** Keeps the raw text (blank and trailing lines included) so typing Enter keeps the cursor; reports the non-blank lines. */
function ValuesField({ values, helperText, onChange }: { values: string[]; helperText: string; onChange: (next: string[]) => void }) {
  const [text, setText] = useState(values.join('\n'))
  const [seen, setSeen] = useState(values)
  if (seen !== values) {
    setSeen(values)
    if (!sameList(splitLines(text), values)) setText(values.join('\n'))
  }
  return (
    <TextField
      label="Values" multiline minRows={2} value={text} helperText={helperText} fullWidth
      onChange={(e) => { setText(e.target.value); onChange(splitLines(e.target.value)) }}
      slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }}
    />
  )
}

function RuleRow({ type, fields, rule, onChange, onRemove }: {
  type: string
  fields: string[]
  rule: FilterRule
  onChange: (next: FilterRule) => void
  onRemove: () => void
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <TextField
        select size="small" label="Field" value={rule.field} sx={{ minWidth: 160 }}
        onChange={(e) => onChange({ ...rule, field: e.target.value })}
      >
        {fields.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
      </TextField>
      <TextField
        select size="small" label="Match" value={rule.match} sx={{ minWidth: 120 }}
        onChange={(e) => onChange({ ...rule, match: e.target.value as FilterRule['match'] })}
      >
        {MATCHES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </TextField>
      <ValuesField values={rule.values} helperText={valuesHint(type, rule)} onChange={(values) => onChange({ ...rule, values })} />
      <IconButton aria-label="Remove rule" onClick={onRemove}><DeleteIcon /></IconButton>
    </Box>
  )
}

export function FiltersEditor({ type, fields, value, onChange }: FiltersEditorProps) {
  // A type change narrows `fields`: drop every rule whose field no longer applies and report it.
  useEffect(() => {
    const applies = (r: FilterRule) => fields.includes(r.field)
    if (value.allow.every(applies) && value.deny.every(applies)) return
    onChange({ allow: value.allow.filter(applies), deny: value.deny.filter(applies) })
  }, [fields, value, onChange])

  const setSide = (side: Side, rules: FilterRule[]) => onChange({ ...value, [side]: rules })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {SECTIONS.map(({ side, title, add }) => {
        const rules = value[side]
        const headingId = `filters-${side}-heading`
        return (
          <Box key={side} component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography id={headingId} variant="subtitle2">{title}</Typography>
            {rules.map((rule, i) => (
              <RuleRow
                key={i} type={type} fields={fields} rule={rule}
                onChange={(next) => setSide(side, rules.map((r, j) => (j === i ? next : r)))}
                onRemove={() => setSide(side, rules.filter((_, j) => j !== i))}
              />
            ))}
            <Box>
              <Button
                size="small" variant="outlined" disabled={fields.length === 0}
                onClick={() => setSide(side, [...rules, { field: fields[0], match: 'equals', values: [] }])}
              >
                {add}
              </Button>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
