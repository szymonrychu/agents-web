/** Answers what an agent's claude waits on: a held permission request, a stuck dialog or a usage-limit wait. */
import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError, answerAgentDialog, getAgentDialog } from '../api/client'
import type { DialogAnswer, DialogView } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'

export interface DialogPanelProps {
  open: boolean
  agentId: string
  agentLabel: string
  onClose: () => void
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** "auto-deny in M:SS" from the server deadline; "auto-deny due" at zero. */
function countdown(expiresAt: string, now: number): string {
  const left = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  if (left === 0) return 'auto-deny due'
  return `auto-deny in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

const mono = { m: 0, p: 1, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'divider' } as const

export function DialogPanel({ open, agentId, agentLabel, onClose }: DialogPanelProps) {
  const [view, setView] = useState<DialogView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [denyOpen, setDenyOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setView(await getAgentDialog(agentId))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the dialog state when the panel opens
    void load()
  }, [open, load])

  const expiresAt = view?.permission?.expires_at
  useEffect(() => {
    if (!open || !expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open, expiresAt])

  async function send(body: DialogAnswer) {
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const r = await answerAgentDialog(agentId, body)
      if (r.status === 'still_open') setNotice('The dialog is still open')
      else onClose()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNotice('The dialog changed; reloaded')
        await load()
      } else {
        setError(errorText(e))
      }
    } finally {
      setSending(false)
      setDenyOpen(false)
    }
  }

  const perm = view?.permission ?? null
  const dismiss = () => void send({ action: 'dismiss', expect_since: view?.since })
  const confirmDeny = () => {
    if (!perm) return
    const text = message.trim()
    void send({ action: 'deny', request_id: perm.request_id, ...(text ? { message: text } : {}) })
  }

  let body = null
  let actions = null
  if (view?.kind === 'permission' && perm) {
    body = (
      <>
        <Typography variant="body2">{`Tool: ${perm.tool_name}`}</Typography>
        <Box component="pre" sx={mono}>{perm.tool_input}</Box>
        {perm.truncated && <Typography variant="caption" color="text.secondary">The input was truncated.</Typography>}
        <Typography variant="body2" color="text.secondary">{countdown(perm.expires_at, now)}</Typography>
      </>
    )
    actions = (
      <>
        <Button disabled={sending} onClick={() => void send({ action: 'allow', request_id: perm.request_id })}>Allow once</Button>
        <Button color="error" disabled={sending} onClick={() => { setMessage(''); setDenyOpen(true) }}>Deny</Button>
      </>
    )
  } else if (view?.kind === 'permission') {
    body = (
      <>
        <Box component="pre" sx={mono}>{view.tail ?? ''}</Box>
        <Typography variant="body2">The permission hook is gone; Dismiss declines the action and interrupts the turn</Typography>
      </>
    )
    actions = <Button disabled={sending} onClick={dismiss}>Dismiss</Button>
  } else if (view?.kind === 'dialog') {
    body = <Box component="pre" sx={mono}>{view.tail ?? ''}</Box>
    actions = <Button disabled={sending} onClick={dismiss}>Dismiss</Button>
  } else if (view?.kind === 'usage_wait') {
    body = <Typography variant="body2">Claude is waiting for the usage limit to reset; it continues automatically</Typography>
  } else if (view?.kind === 'none') {
    body = <Typography variant="body2">Nothing is waiting on this agent</Typography>
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>{`${view?.kind === 'permission' && perm ? 'Permission request' : 'Agent dialog'} - ${agentLabel}`}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {loading && !view && <CircularProgress size={24} aria-label="loading dialog" />}
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="info">{notice}</Alert>}
          {body}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          {actions}
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={denyOpen} title="Deny this action?" confirmLabel="Deny" confirmDisabled={sending} onConfirm={confirmDeny} onCancel={() => setDenyOpen(false)}>
        <TextField autoFocus fullWidth size="small" margin="dense" label="Message to the agent (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      </ConfirmDialog>
    </>
  )
}
