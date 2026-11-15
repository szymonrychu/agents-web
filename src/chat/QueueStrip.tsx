/** Queued, verifying and failed messages of a session, with Cancel and Retry (icon buttons on a phone); hidden when empty. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import ReplayIcon from '@mui/icons-material/Replay'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { cancelMessage, listMessages, retryMessage, statusStreamUrl } from '../api/client'
import type { MessageView } from '../api/client'
import { openStream } from '../api/stream'
import { useLayout } from '../layout/useLayout'
import { TOKENS } from '../theme'

export const QUEUE_STATUSES = 'queued,verifying,failed'

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const isAmbiguous = (m: MessageView): boolean => /ambiguous/i.test(m.error ?? '')

interface ActionProps {
  phone: boolean
  label: string
  icon: ReactNode
  color?: 'warning'
  onClick: () => void
}

/** A row action: a text button, or on a phone an icon button with the same accessible name. */
function Action({ phone, label, icon, color, onClick }: ActionProps) {
  return phone ? (
    <Tooltip title={label}>
      <IconButton aria-label={label} color={color} onClick={onClick}>
        {icon}
      </IconButton>
    </Tooltip>
  ) : (
    <Button size="small" color={color} onClick={onClick}>
      {label}
    </Button>
  )
}

function detail(m: MessageView): string | null {
  if (m.status === 'verifying') return 'checking delivery'
  if (m.status === 'queued' && m.next_attempt_at) return `attempt ${m.attempts} of ${m.max_attempts}, next attempt ${new Date(m.next_attempt_at).toLocaleString()}`
  return null
}

export function QueueStrip({ sessionId }: { sessionId: string }) {
  const [shown, setShown] = useState<{ sessionId: string; messages: MessageView[] }>({ sessionId, messages: [] })
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const latest = useRef(0)
  const phone = useLayout() === 'phone'

  const refresh = useCallback(() => {
    const mine = ++latest.current
    listMessages(sessionId, { status: QUEUE_STATUSES })
      .then((messages) => {
        if (latest.current === mine) setShown({ sessionId, messages })
      })
      .catch((e: unknown) => {
        if (latest.current === mine) setError(errorText(e))
      })
  }, [sessionId])

  useEffect(() => {
    const token = latest
    refresh()
    const stream = openStream(statusStreamUrl(), {
      eventNames: ['message_status'],
      onEvent: (data) => {
        if ((data as { session_id?: string } | null)?.session_id === sessionId) refresh()
      },
    })
    return () => {
      token.current++
      stream.close()
    }
  }, [sessionId, refresh])

  const act = (call: () => Promise<unknown>) => {
    setError(null)
    setConfirming(null)
    call().then(refresh, (e: unknown) => setError(errorText(e)))
  }

  const messages = shown.sessionId === sessionId ? shown.messages : []
  if (messages.length === 0 && !error) return null
  return (
    <Box sx={{ py: 1, borderTop: `${TOKENS.borderWidth}px solid ${TOKENS.border}` }}>
      {error ? (
        <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {messages.map((m) => (
        <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: phone ? 'wrap' : undefined, gap: 1, py: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 64 }}>
            {m.status}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {m.notice ? (
              <Typography variant="caption" sx={{ color: 'info.main', display: 'block' }}>
                orchestrator notice
              </Typography>
            ) : null}
            <Typography noWrap>{m.text}</Typography>
            {detail(m) ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {detail(m)}
              </Typography>
            ) : null}
            {m.status === 'failed' && m.error ? (
              <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
                {m.error}
              </Typography>
            ) : null}
            {confirming === m.id ? (
              <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
                This turn may already have run; retrying could send it twice.
              </Typography>
            ) : null}
          </Box>
          {m.status === 'queued' ? (
            <Action phone={phone} label="Cancel" icon={<CloseIcon fontSize="small" />} onClick={() => act(() => cancelMessage(String(m.id)))} />
          ) : null}
          {m.status === 'failed' ? (
            confirming === m.id ? (
              <Action phone={phone} label="Retry anyway" color="warning" icon={<ReplayIcon fontSize="small" />} onClick={() => act(() => retryMessage(String(m.id)))} />
            ) : (
              <Action phone={phone} label="Retry" icon={<ReplayIcon fontSize="small" />} onClick={() => (isAmbiguous(m) ? setConfirming(m.id) : act(() => retryMessage(String(m.id))))} />
            )
          ) : null}
        </Box>
      ))}
    </Box>
  )
}
