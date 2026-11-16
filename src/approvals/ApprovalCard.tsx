import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { Markdown } from '../markdown/Markdown'
import { FormError } from '../triggers'
import { answerDecision, type Decision } from '../tasks/api'
import { expiresIn } from './api'

export interface ApprovalCardProps {
  taskKey: string
  decision: Decision
  /** Called after an answer or a 409, so the task is refetched. */
  onChanged: () => void
}

const isUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://')

function closedText(d: Decision): string {
  if (d.status === 'expired') return 'Expired'
  if (d.status === 'withdrawn') return d.withdraw_reason ? `Withdrawn: ${d.withdraw_reason}` : 'Withdrawn'
  const label = d.answer?.choice === 1 ? 'No-go' : 'Go'
  return d.note ? `${label} (${d.note})` : label
}

export function ApprovalCard({ taskKey, decision, onChanged }: ApprovalCardProps) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = decision.status === 'open'

  const submit = async (choice: 0 | 1) => {
    setBusy(true)
    setError(null)
    try {
      const n = note.trim()
      await answerDecision(taskKey, decision.id, n === '' ? { choice } : { choice, note: n })
      onChanged()
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'already_answered' || e.code === 'expired')) {
        setNotice(e.code === 'expired' ? 'Expired' : 'Already answered')
        onChanged()
      } else setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ fontWeight: 500 }}>{decision.question}</Typography>
      {decision.subject &&
        (isUrl(decision.subject) ? (
          <Link href={decision.subject} target="_blank" rel="noopener noreferrer" sx={{ overflowWrap: 'anywhere' }}>
            {decision.subject}
          </Link>
        ) : (
          <Typography>{decision.subject}</Typography>
        ))}
      <Typography variant="caption" color="text.secondary">{`Asked by ${decision.asking_slug ?? decision.asking_session}`}</Typography>
      {open && decision.expires_at && (
        <Typography variant="caption" color="text.secondary">{expiresIn(decision.expires_at, new Date())}</Typography>
      )}
      {decision.context !== '' && <Markdown>{decision.context}</Markdown>}
      {!open && <Typography color="text.secondary">{closedText(decision)}</Typography>}
      {open && (
        <>
          {notice && <Alert severity="info">{notice}</Alert>}
          <FormError error={error} />
          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" disabled={busy} onClick={() => void submit(0)}>Go</Button>
            <Button variant="outlined" disabled={busy} onClick={() => void submit(1)}>No-go</Button>
          </Box>
        </>
      )}
    </Paper>
  )
}
