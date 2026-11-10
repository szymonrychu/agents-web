import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { Link as RouterLink } from 'react-router'
import { FormError } from '../triggers'
import { answerDecision, type AnswerIn, type Decision } from './api'

export interface DecisionCardProps {
  taskKey: string
  decision: Decision
  /** Called after an answer or a 409, so the task is refetched. */
  onChanged: () => void
}

function answerText(d: Decision): string {
  if (d.answer === null) return d.status
  return d.answer.text ?? d.answer.label ?? d.status
}

export function DecisionCard({ taskKey, decision, onChanged }: DecisionCardProps) {
  const [choice, setChoice] = useState<number | null>(null)
  const [own, setOwn] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [already, setAlready] = useState(false)
  const [busy, setBusy] = useState(false)

  const header = (
    <>
      <Typography sx={{ fontWeight: 500 }}>{decision.question}</Typography>
      <Typography variant="caption" color="text.secondary">{`Asked by ${decision.asking_slug ?? decision.asking_session}`}</Typography>
      {decision.context !== '' && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{decision.context}</Typography>}
    </>
  )

  if (decision.status !== 'open') {
    return (
      <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {header}
        <Typography color="text.secondary">
          {decision.status === 'withdrawn'
            ? decision.withdraw_reason ? `Withdrawn: ${decision.withdraw_reason}` : 'Withdrawn'
            : `Answer: ${answerText(decision)}`}
          {decision.note ? ` (${decision.note})` : ''}
        </Typography>
        {decision.status === 'withdrawn' && decision.superseded_by != null && (
          decision.superseded_by_task_key ? (
            <Link component={RouterLink} to={`/tasks/${decision.superseded_by_task_key}`}>
              {`Superseded by decision #${decision.superseded_by}`}
            </Link>
          ) : (
            <Typography color="text.secondary">{`Superseded by decision #${decision.superseded_by}`}</Typography>
          )
        )}
        {decision.status === 'withdrawn' && decision.answered_elsewhere && (
          <Typography color="text.secondary">{`Answered elsewhere: ${decision.answered_elsewhere}`}</Typography>
        )}
      </Paper>
    )
  }

  const ownText = own.trim()
  const answer: AnswerIn | null = ownText !== '' ? { text: ownText } : choice !== null ? { choice } : null
  const submit = async () => {
    if (answer === null) return
    setBusy(true)
    setError(null)
    try {
      await answerDecision(taskKey, decision.id, note.trim() === '' ? answer : { ...answer, note: note.trim() })
      onChanged()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_answered') {
        setAlready(true)
        onChanged()
      } else setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {header}
      {already && <Alert severity="info">Already answered</Alert>}
      <FormError error={error} />
      <RadioGroup
        aria-label={`Options for ${decision.question}`}
        value={choice === null ? '' : String(choice)}
        onChange={(e) => {
          setChoice(Number(e.target.value))
          setOwn('')
        }}
      >
        {decision.options.map((o, i) => (
          <FormControlLabel
            key={i}
            value={String(i)}
            control={<Radio size="small" />}
            label={
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography component="span">{o.label}</Typography>
                  {o.recommended && <Chip size="small" color="primary" label="Recommended" />}
                </Box>
                {o.description && <Typography variant="body2" color="text.secondary">{o.description}</Typography>}
              </Box>
            }
          />
        ))}
      </RadioGroup>
      <TextField
        size="small"
        label="Own answer"
        value={own}
        onChange={(e) => {
          setOwn(e.target.value)
          setChoice(null)
        }}
      />
      <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Box>
        <Button variant="contained" disabled={answer === null || busy} onClick={() => void submit()}>Submit</Button>
      </Box>
    </Paper>
  )
}
