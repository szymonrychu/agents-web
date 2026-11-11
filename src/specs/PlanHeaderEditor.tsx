import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { ApiError } from '../api/client'
import { FormError } from '../triggers'
import { putPlan, type Plan } from './api'

export const CHANGED_MEANWHILE = 'This changed meanwhile, reloaded; check your edits and try again.'

const LIMITS = { goal: 500, architecture: 4000, tech_stack: 1000, lines: 50, line: 1000 }

interface Fields {
  goal: string
  architecture: string
  tech_stack: string
  constraints: string
  review_focus: string
}
const fieldsOf = (p: Plan): Fields => ({
  goal: p.goal, architecture: p.architecture, tech_stack: p.tech_stack, constraints: p.constraints.join('\n'), review_focus: p.review_focus.join('\n'),
})
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
const linesError = (text: string): string | undefined => {
  const ls = lines(text)
  if (ls.length > LIMITS.lines) return `at most ${LIMITS.lines} lines`
  if (ls.some((l) => l.length > LIMITS.line)) return `a line is over ${LIMITS.line} characters`
  return undefined
}

/** Edits the plan header; a stale `version` (412) keeps the draft and offers the parent's fresh plan. */
export function PlanHeaderEditor({ specKey, plan, onSaved, onConflict }: { specKey: string; plan: Plan; onSaved: () => void; onConflict: () => void }) {
  const [fields, setFields] = useState<Fields>(() => fieldsOf(plan))
  // The plan the draft is based on: its version is what a save sends, so a stale draft gets a 412.
  const [base, setBase] = useState<{ version: number; fields: Fields }>(() => ({ version: plan.version, fields: fieldsOf(plan) }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [changed, setChanged] = useState(false)
  const sameFields = (a: Fields, b: Fields) => (Object.keys(a) as (keyof Fields)[]).every((k) => a[k] === b[k])
  const incoming = fieldsOf(plan)
  const newer = base.version !== plan.version
  // A newer version replaces an untouched form (or one already equal to it); a draft is kept (adjusting state during render).
  if (newer && (sameFields(fields, base.fields) || sameFields(fields, incoming))) {
    setBase({ version: plan.version, fields: incoming })
    setFields(incoming)
  }
  const draftBehind = newer && !sameFields(fields, base.fields) && !sameFields(fields, incoming)
  const reload = () => {
    setBase({ version: plan.version, fields: incoming })
    setFields(incoming)
    setChanged(false)
  }
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }))
  const errs = {
    goal: fields.goal.length > LIMITS.goal ? `at most ${LIMITS.goal} characters` : undefined,
    architecture: fields.architecture.length > LIMITS.architecture ? `at most ${LIMITS.architecture} characters` : undefined,
    tech_stack: fields.tech_stack.length > LIMITS.tech_stack ? `at most ${LIMITS.tech_stack} characters` : undefined,
    constraints: linesError(fields.constraints),
    review_focus: linesError(fields.review_focus),
  }
  const invalid = Object.values(errs).some((e) => e !== undefined)

  const save = async () => {
    setBusy(true)
    setError(null)
    setChanged(false)
    try {
      await putPlan(specKey, {
        version: base.version,
        goal: fields.goal,
        architecture: fields.architecture,
        tech_stack: fields.tech_stack,
        constraints: lines(fields.constraints),
        review_focus: lines(fields.review_focus),
      })
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && (e.status === 412 || e.status === 409)) {
        setChanged(true)
        onConflict()
      } else setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  const text = (k: keyof Fields, label: string, multiline = false, helper?: string) => (
    <TextField size="small" label={label} value={fields[k]} onChange={set(k)} multiline={multiline} minRows={multiline ? 2 : undefined} error={errs[k] !== undefined} helperText={errs[k] ?? helper} />
  )
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {text('goal', 'Goal')}
      {text('architecture', 'Architecture', true)}
      {text('tech_stack', 'Tech stack', true)}
      {text('constraints', 'Constraints', true, 'One per line')}
      {text('review_focus', 'Review focus', true, 'One per line')}
      {draftBehind && (
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={reload}>Reload newer version</Button>}>
          A newer version available; your edits are kept. Saving now will be refused until you reload.
        </Alert>
      )}
      {changed && <Alert severity="warning">{CHANGED_MEANWHILE}</Alert>}
      <FormError error={error} />
      <Box>
        <Button variant="contained" disabled={busy || invalid} onClick={() => void save()}>Save plan header</Button>
      </Box>
    </Box>
  )
}
