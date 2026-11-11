import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { MermaidBlock } from '../markdown/MermaidBlock'
import { TOKENS } from '../theme'
import { taskPath } from '../tasks/paths'
import { FormError, usePoll } from '../triggers'
import { getPlan, listSteps, type Plan, type Step } from './api'
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

/** The spec's plan: header fields, the ordered steps and their dependency graph. */
export function PlanTab({ specKey }: { specKey: string }) {
  const { data, error, refresh } = usePoll(() => load(specKey), POLL_MS, [specKey])
  useSpecStream((ev) => {
    if (ev.type === 'reset' || ev.key === specKey) void refresh()
  })
  if (!data) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>
  const { plan, steps } = data
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormError error={error} />
      <Header plan={plan} />
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
              </TableRow>
            </TableHead>
            <TableBody>
              {steps.map((s) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <MermaidBlock source={stepsGraph(steps)} />
        </>
      )}
    </Box>
  )
}
