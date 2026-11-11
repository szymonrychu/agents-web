import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../api/client'
import { MermaidBlock } from '../markdown/MermaidBlock'
import { TOKENS } from '../theme'
import { taskPath } from '../tasks/paths'
import { FormError, usePoll } from '../triggers'
import { getPlan, listSteps, patchStep, reorderSteps, type Plan, type Step } from './api'
import { CHANGED_MEANWHILE, PlanHeaderEditor } from './PlanHeaderEditor'
import { StepEditor, type StepEditorTarget } from './StepEditor'
import { stepsGraph } from './StepsGraph'
import { useSpecStream } from './useSpecStream'

const POLL_MS = 10000

interface Loaded {
  plan: Plan
  steps: Step[]
  stepsVersion: number
}

async function load(key: string): Promise<Loaded> {
  const [plan, list] = await Promise.all([getPlan(key), listSteps(key)])
  return { plan, steps: list.items, stepsVersion: list.steps_version }
}

const isUrl = (v: string) => /^https?:\/\//.test(v)

function Refs({ refs }: { refs: Step['refs'] }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {refs.map((r) => {
        const text = `${r.kind} ${r.value}`
        return isUrl(r.value) ? <Link key={text} href={r.value} target="_blank" rel="noreferrer noopener">{text}</Link> : <span key={text}>{text}</span>
      })}
    </Box>
  )
}

function Header({ plan }: { plan: Plan }) {
  const blocks: [string, string | string[]][] = [
    ['Goal', plan.goal],
    ['Architecture', plan.architecture],
    ['Tech stack', plan.tech_stack],
    ['Constraints', plan.constraints],
    ['Review focus', plan.review_focus],
  ]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {blocks.map(([title, value]) => {
        const items = Array.isArray(value) ? value : value ? [value] : []
        if (items.length === 0) return null
        return (
          <Box key={title}>
            <Typography color="text.secondary" sx={{ fontSize: TOKENS.fontSizes.sm }}>{title}</Typography>
            {items.map((v, i) => <Typography key={i} sx={{ whiteSpace: 'pre-wrap' }}>{v}</Typography>)}
          </Box>
        )
      })}
    </Box>
  )
}

/** Steps nobody started can be dropped. */
const droppable = (s: Step) => s.status === 'open' || s.status === 'idea'

/** The spec's plan: header fields, the ordered steps with their editors, and the dependency graph. */
export function PlanTab({ specKey }: { specKey: string }) {
  const { data, error, refresh } = usePoll(() => load(specKey), POLL_MS, [specKey])
  const [editing, setEditing] = useState<StepEditorTarget | null>(null)
  const [headerOpen, setHeaderOpen] = useState(false)
  const [notice, setNotice] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  useSpecStream((ev) => {
    if (ev.type === 'reset' || ev.key === specKey) void refresh()
  })
  if (!data) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>
  const { plan, steps, stepsVersion } = data

  // A 412 or 409 means the plan moved under the editor: say so and refetch.
  const guarded = async (fn: () => Promise<unknown>) => {
    setActionError(null)
    setNotice(false)
    setPending(true)
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && (e.status === 412 || e.status === 409)) setNotice(true)
      else setActionError(e instanceof Error ? e : new Error(String(e)))
    }
    try {
      await refresh()
    } finally {
      setPending(false)
    }
  }
  const move = (i: number, by: -1 | 1) => {
    const order = steps.map((s) => s.key)
    ;[order[i], order[i + by]] = [order[i + by], order[i]]
    return guarded(() => reorderSteps(specKey, stepsVersion, order))
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormError error={error} />
      <FormError error={actionError} />
      {notice && <Alert severity="warning">{CHANGED_MEANWHILE}</Alert>}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" onClick={() => setHeaderOpen((o) => !o)}>{headerOpen ? 'Close plan header editor' : 'Edit plan header'}</Button>
        <Button size="small" onClick={() => setEditing({ mode: 'new' })} aria-label="Add step at end">Add step</Button>
      </Box>
      {headerOpen ? (
        <PlanHeaderEditor specKey={specKey} plan={plan} onSaved={() => { setHeaderOpen(false); void refresh() }} onConflict={() => void refresh()} />
      ) : (
        <Header plan={plan} />
      )}
      {steps.length === 0 && <Typography color="text.secondary">No steps</Typography>}
      {steps.length > 0 && (
        <>
          <Table size="small" aria-label="Steps">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Step</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assignee</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Refs</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {steps.map((s, i) => (
                <TableRow key={s.key} hover>
                  <TableCell>{s.step}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={taskPath(s.key)}>{s.key}</Link> {s.title}
                    {s.todo_total > 0 && <Typography component="span" color="text.secondary"> {`(${s.todo_done}/${s.todo_total})`}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={s.status.replace('_', ' ')} />
                    {s.ready && <Chip size="small" color="success" label="ready" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>{s.assignee_session}</TableCell>
                  <TableCell>{s.model}</TableCell>
                  <TableCell><Refs refs={s.refs} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                      <Button size="small" aria-label={`Edit step ${s.step}`} onClick={() => setEditing({ mode: 'edit', step: s })}>Edit</Button>
                      <Button size="small" aria-label={`Move step ${s.step} up`} disabled={pending || i === 0} onClick={() => void move(i, -1)}>Up</Button>
                      <Button size="small" aria-label={`Move step ${s.step} down`} disabled={pending || i === steps.length - 1} onClick={() => void move(i, 1)}>Down</Button>
                      <Button size="small" aria-label={`Add step after ${s.step}`} onClick={() => setEditing({ mode: 'new', after: s.step })}>Add after</Button>
                      {droppable(s) && <Button size="small" color="warning" disabled={pending} aria-label={`Drop step ${s.step}`} onClick={() => void guarded(() => patchStep(s.key, { version: s.version, status: 'dropped' }))}>Drop</Button>}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <MermaidBlock source={stepsGraph(steps)} />
        </>
      )}
      {editing && (
        <StepEditor
          key={editing.mode === 'edit' ? editing.step.key : `new-${editing.after ?? 'end'}`}
          target={editing}
          steps={steps}
          stepsVersion={stepsVersion}
          specKey={specKey}
          onClose={() => setEditing(null)}
          onChanged={() => void refresh()}
        />
      )}
    </Box>
  )
}
