import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { taskPath } from '../tasks/paths'
import { FormError, usePoll } from '../triggers'
import { getGate } from './api'
import { useSpecStream } from './useSpecStream'

const POLL_MS = 10000

/** `{choice, label}` or `{text}` once answered; anything else is shown as JSON. */
function answerText(answer: unknown): string {
  if (answer && typeof answer === 'object') {
    const a = answer as { label?: unknown; text?: unknown }
    if (typeof a.label === 'string') return a.label
    if (typeof a.text === 'string') return a.text
  }
  return JSON.stringify(answer)
}

/** The spec's gate: the decisions of its gate task. Approval is optional, the gate opens when every decision is answered. */
export function GatePanel({ specKey, onApprove }: { specKey: string; onApprove: () => void }) {
  const { data, error, refresh } = usePoll(() => getGate(specKey), POLL_MS, [specKey])
  useSpecStream((ev) => {
    if (ev.type === 'reset' || ev.key === specKey) void refresh()
  })
  if (!data) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>
  const canApprove = data.status === 'draft' || data.status === 'review'
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormError error={error} />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography>Gate</Typography>
        <Chip size="small" color={data.gate === 'open' ? 'success' : data.gate === 'waiting' ? 'warning' : 'default'} label={data.gate} />
        {data.gate_task && <Link component={RouterLink} to={taskPath(data.gate_task)}>{data.gate_task}</Link>}
      </Box>
      {data.decisions.length === 0 && <Typography color="text.secondary">No gate decisions</Typography>}
      {data.decisions.map((d) => (
        <Box key={d.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography>{d.question}</Typography>
          {d.status === 'open' ? <Chip size="small" color="warning" label="open" /> : <Chip size="small" variant="outlined" label={answerText(d.answer)} />}
        </Box>
      ))}
      {data.approved_versions && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Typography color="text.secondary">Approved versions</Typography>
          {Object.entries(data.approved_versions).map(([path, v]) => <Chip key={path} size="small" label={`${path} v${v}`} />)}
        </Box>
      )}
      {canApprove && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={onApprove}>Approve</Button>
          <Typography color="text.secondary">Approval is optional: the gate opens once every decision is answered.</Typography>
        </Box>
      )}
    </Box>
  )
}
