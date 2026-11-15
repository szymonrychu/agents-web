/**
 * Message input of one session; target is any free agent or one ordinal. With a mouse on a wide window: one row, Enter
 * sends, Shift+Enter is a newline. On touch or a small window (useTouchOrSmall): two rows (message and an icon Send, then
 * lane and target), Return is a newline and only the Send button sends, the lane hints move into the lane menu.
 */
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import FormHelperText from '@mui/material/FormHelperText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import SendIcon from '@mui/icons-material/Send'
import { postMessage } from '../api/client'
import type { AgentView, PostMessage } from '../api/client'
import { useTouchOrSmall } from '../layout/useLayout'
import { TOKENS } from '../theme'

export interface ComposerProps {
  sessionId: string
  agents: AgentView[]
  deleting: boolean
}

const ANY = ''

type Lane = PostMessage['lane']
const LANES: { value: Lane; label: string; hint: string }[] = [
  { value: 'idle', label: 'Idle', hint: 'Idle: waits until the agent is free.' },
  { value: 'regular', label: 'Regular', hint: 'Regular: delivered at the next tool boundary of a running turn.' },
  { value: 'priority', label: 'Priority (interrupts the agent)', hint: 'Priority: interrupts the agent right now.' },
]

export function Composer({ sessionId, agents, deleting }: ComposerProps) {
  const [text, setText] = useState('')
  const [target, setTarget] = useState(ANY)
  const [lane, setLane] = useState<Lane>('regular')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const compact = useTouchOrSmall()
  const canSend = text.trim() !== '' && !deleting && !sending
  // A chosen agent that left the list falls back to any free agent.
  const chosen = agents.some((a) => a.id === target) ? target : ANY

  const send = () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    postMessage(sessionId, chosen === ANY ? { text, lane } : { text, lane, target_agent_id: chosen })
      .then(() => setText(''))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSending(false))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    // On touch the on-screen Return key is the only way to type a newline, so only the Send button sends.
    if (compact || e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    send()
  }

  const message = (
    <TextField
      multiline
      maxRows={8}
      fullWidth
      size="small"
      placeholder="Message the session"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      sx={{ minWidth: 0 }}
      slotProps={{ htmlInput: { 'aria-label': 'Message', enterKeyHint: compact ? 'enter' : 'send' } }}
    />
  )
  const laneSelect = (
    <Select size="small" value={lane} onChange={(e) => setLane(e.target.value as Lane)} inputProps={{ 'aria-label': 'Lane' }} renderValue={(v) => LANES.find((l) => l.value === v)?.label} sx={compact ? { flex: 1, minWidth: 0 } : { minWidth: 120 }}>
      {LANES.map((l) => (
        <MenuItem key={l.value} value={l.value}>
          {compact ? <ListItemText primary={l.label} secondary={l.hint} /> : l.label}
        </MenuItem>
      ))}
    </Select>
  )
  const targetSelect = (
    <Select size="small" value={chosen} onChange={(e) => setTarget(e.target.value)} inputProps={{ 'aria-label': 'Target agent' }} sx={compact ? { flex: 1, minWidth: 0 } : { minWidth: 160 }}>
      <MenuItem value={ANY}>Any free agent</MenuItem>
      {agents.map((a) => (
        <MenuItem key={a.id} value={a.id}>
          Agent {a.ordinal}
        </MenuItem>
      ))}
    </Select>
  )

  return (
    <Box sx={{ pt: 1, borderTop: `${TOKENS.borderWidth}px solid ${TOKENS.border}` }}>
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {compact ? (
        <>
          <Box data-testid="composer-row-main" sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            {message}
            <IconButton
              aria-label="Send"
              onClick={send}
              disabled={!canSend}
              sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box data-testid="composer-row-options" sx={{ display: 'flex', gap: 1, pt: 1 }}>
            {laneSelect}
            {targetSelect}
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            {message}
            {laneSelect}
            {targetSelect}
            <Button variant="contained" onClick={send} disabled={!canSend}>
              Send
            </Button>
          </Box>
          <FormHelperText>{LANES.find((l) => l.value === lane)?.hint}</FormHelperText>
        </>
      )}
    </Box>
  )
}
