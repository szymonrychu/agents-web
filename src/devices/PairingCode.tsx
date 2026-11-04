/** The 6-digit pairing code, large and grouped 3+3, with a countdown and a New code action. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export interface PairingCodeProps {
  code: string
  /** Seconds the code lives, counted from receipt (no clock skew). */
  expiresIn: number
  locked: boolean
  busy: boolean
  onNewCode: () => void
}

/** A new code remounts the countdown, which restarts it. */
export function PairingCode(props: PairingCodeProps) {
  return <Countdown key={props.code} {...props} />
}

function Countdown({ code, expiresIn, locked, busy, onNewCode }: PairingCodeProps) {
  const [remaining, setRemaining] = useState(expiresIn)
  useEffect(() => {
    const end = Date.now() + expiresIn * 1000
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000)
    return () => clearInterval(timer)
  }, [expiresIn])

  const expired = remaining <= 0
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {locked ? (
        <Typography role="alert">Locked: too many wrong attempts, generate a new code.</Typography>
      ) : expired ? (
        <Typography role="status">Code expired. Generate a new code.</Typography>
      ) : (
        <>
          <Typography aria-label="Pairing code" sx={{ fontFamily: 'monospace', fontSize: '3rem', fontWeight: 500, letterSpacing: '0.2em' }}>
            {formatCode(code)}
          </Typography>
          <Typography>Expires in <span aria-live="off">{formatCountdown(remaining)}</span></Typography>
        </>
      )}
      <Box><Button size="small" variant="outlined" disabled={busy} onClick={onNewCode}>New code</Button></Box>
    </Box>
  )
}
