/** Discard confirmation: states what is deleted and what is backed up (from `session.backup`), names the pre-discard hook, requires the typed slug. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { deleteSession, getMeta } from '../api/client'
import type { SessionView, Meta } from '../api/client'
import { ConfirmDialog } from '../layout/ConfirmDialog'

/** Mount it per discard (state starts fresh); the typed slug is not reset between opens. */
export interface DiscardSessionDialogProps {
  open: boolean
  session: SessionView
  onClose: () => void
  onDiscarded: () => void
}

/** What the pre-discard export goes to, or null when no hook applies. */
export function hookTarget(session: SessionView, meta: Meta | null): string | null {
  if (session.spec.discard_hook_url) return session.spec.discard_hook_url
  return meta && meta.discard_hook !== 'none' ? `the configured ${meta.discard_hook} hook` : null
}

/** The backup skip reason in words; the two api reasons, the restore gate and the save rule's `not_configured`, anything else verbatim. */
export function backupReasonText(reason: string | null): string {
  switch (reason) {
    case null:
    case 'no_session_cache':
      return 'the session has no session cache'
    case 'cache_not_configured':
    case 'not_configured':
      return 'no S3 cache is configured on this orchestrator'
    case 'restore_running':
      return 'the cache restore has not finished'
    case 'restore_failed':
      return 'the cache restore failed, so the workspace is not saved over the stored copy'
    case 'restore_skipped':
      return 'the cache restore was skipped, so the workspace is not saved over the stored copy'
    default:
      return `skipped (${reason})`
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`
}

function ItemList({ label, items }: { label: string; items: string[] }) {
  return (
    <>
      <Typography sx={{ mt: 2, fontWeight: 500 }}>{label}</Typography>
      <Box component="ul" aria-label={label} sx={{ mt: 0.5, mb: 0, pl: 3 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Box>
    </>
  )
}

export function DiscardSessionDialog({ open, session, onClose, onDiscarded }: DiscardSessionDialogProps) {
  const [typed, setTyped] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getMeta()
      .then((m) => {
        if (!cancelled) setMeta(m)
      })
      .catch(() => {
        // The session's own hook URL still applies without meta.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const target = hookTarget(session, meta)
  const { backup } = session
  const nothingSaved = !backup.workdir && !backup.transcripts
  const deleted = [
    'The agents',
    'The workspace PVC',
    "The session's whole chat history (messages, events, turns, commands, checks)",
    ...(backup.transcripts ? [] : ['The Claude transcripts']),
    ...(backup.workdir ? [] : ['The workspace files']),
  ]
  const restored = 'restored when a session with the same slug is created'
  const saved = [
    ...(backup.workdir ? [`Workspace files: saved to the S3 cache under the key ${session.spec.cache?.key ?? '(the session cache key)'}, ${restored}`] : []),
    ...(backup.transcripts ? [`Claude transcripts: saved to the S3 cache, ${restored}`] : []),
  ]
  const lastBackup = backup.last_transcripts_backup
  const hookFailed = Boolean(session.status.discard_hook_failed)

  async function discard() {
    setError(null)
    try {
      await deleteSession(session.id)
      onDiscarded()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Discard ${session.slug}?`}
      body="Discarding deletes what is listed below. There is no undo."
      confirmLabel="Discard"
      confirmDisabled={typed !== session.slug}
      onConfirm={() => void discard()}
      onCancel={onClose}
    >
      <ItemList label="Deleted" items={deleted} />
      {saved.length > 0 && <ItemList label="Backed up" items={saved} />}
      {nothingSaved && <Typography sx={{ mt: 2 }}>{`Nothing is backed up: ${backupReasonText(backup.reason)}.`}</Typography>}
      {!nothingSaved && backup.reason !== null && (
        <Typography sx={{ mt: 2 }}>
          {`The ${backup.workdir ? 'Claude transcripts are' : 'workspace files are'} not backed up: ${backupReasonText(backup.reason)}.`}
        </Typography>
      )}
      {backup.transcripts && lastBackup && (
        <Typography sx={{ mt: 2 }}>
          {`The last transcripts backup finished at ${lastBackup.finished_at} (${formatBytes(lastBackup.bytes)}); a new one replaces it.`}
        </Typography>
      )}
      {target && (
        <Typography sx={{ mt: 2 }}>
          The full history is exported to {target} first; a failing hook holds the discard.
        </Typography>
      )}
      {hookFailed && <Alert severity="error" sx={{ mt: 2 }}>The pre-discard hook failed, so the discard is on hold.</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <TextField size="small" fullWidth sx={{ mt: 2 }} label="Type the slug to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
    </ConfirmDialog>
  )
}
