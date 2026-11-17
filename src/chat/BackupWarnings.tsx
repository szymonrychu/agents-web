/** Backup warnings of a running session: a restore that found nothing, could not be read or failed, a live delivery skipped for unsaved changes, a save refused for a secret. */
import Alert from '@mui/material/Alert'
import type { SessionView } from '../api/client'

type Dict = Record<string, unknown>
const obj = (v: unknown): Dict => (typeof v === 'object' && v !== null ? (v as Dict) : {})

const RESTORE: Record<string, string> = {
  missing: 'no backup of this name exists yet, the directory was left as it is',
  unreadable: 'the backup could not be read, the directory was left as it is',
}
const RESTORE_FAILED = 'the restore failed, the directory was left as it is'
const LIVE: Record<string, string> = {
  skipped_dirty: 'a new version was not delivered because this session has unsaved changes; save them (orchestrator_backup_save) or the next save makes yours current',
  missing: 'the new version is missing, the directory was left as it is',
  unreadable: 'the new version could not be read, the directory was left as it is',
}
const SAVE: Record<string, string> = { refused_secret: 'not saved, it holds a secret' }

/** The warning lines of a session's entry records (`status.backup.entries`), in entry order. */
export function backupWarnings(session: SessionView): string[] {
  const entries = obj(obj(session.status).backup).entries
  if (!Array.isArray(entries)) return []
  return entries.flatMap((raw, i) => {
    const entry = obj(raw)
    const index = typeof entry.index === 'number' ? entry.index : i
    return ([['restore', RESTORE], ['live_delivery', LIVE], ['save', SAVE]] as const).flatMap(([key, texts]) => {
      const record = obj(entry[key])
      const state = typeof record.state === 'string' ? record.state : ''
      const reason = typeof record.reason === 'string' && record.reason !== '' ? record.reason : ''
      const text = key === 'restore' && state === 'failed' ? RESTORE_FAILED.replace('failed', reason === '' ? 'failed' : `failed (${reason})`) : texts[state]
      if (text === undefined) return []
      const name = typeof record.name === 'string' && record.name !== '' ? ` (${record.name})` : ''
      return [`Entry ${index + 1}${name}: ${text}`]
    })
  })
}

export function BackupWarnings({ session }: { session: SessionView }) {
  const lines = session.desired === 'deleting' ? [] : backupWarnings(session)
  if (lines.length === 0) return null
  return (
    <Alert severity="warning" variant="outlined" role="status" sx={{ my: 1 }}>
      {lines.map((line) => <div key={line}>{line}</div>)}
    </Alert>
  )
}
