/** Form rows of a spec's `backup` entries and their mapping to and from the API form; no defaults are implied (decision 767). */
import type { components } from '../api/schema'

export type BackupEntry = components['schemas']['BackupEntry']
export type BackupRoot = BackupEntry['root']
export type BackupMode = BackupEntry['mode']

export interface BackupRow {
  root: BackupRoot
  path: string
  mode: BackupMode
  /** Jinja template naming the backup (surface `archive_name`). */
  name: string
  /** One glob per line, relative to the entry's path. */
  exclude: string
  live: boolean
  afterInit: boolean
}

export const MAX_BACKUP_NAME = 256
export const MAX_BACKUP_EXCLUDE = 50
export const MAX_BACKUP_EXCLUDE_CHARS = 256
export const BACKUP_ROOTS: readonly BackupRoot[] = ['workspace', 'claude']
export const BACKUP_MODES: readonly BackupMode[] = ['backup', 'restore', 'both']

/** A new row for the editor: the user picks each value, nothing is derived. */
export const blankBackupRow = (): BackupRow => ({ root: 'workspace', path: '', mode: 'both', name: '', exclude: '', live: false, afterInit: false })

export const rowFromEntry = (e: BackupEntry): BackupRow => ({
  root: e.root, path: e.path, mode: e.mode, name: e.name, exclude: (e.exclude ?? []).join('\n'), live: e.live ?? false, afterInit: e.after_init ?? false,
})

/** The exclude globs of the text: one per line, trimmed, blank lines dropped. */
export const excludeLines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter(Boolean)

/** Every field is sent, so a stored entry never depends on a server default. */
export const entryFromRow = (r: BackupRow): BackupEntry => ({
  root: r.root, path: r.path.trim(), mode: r.mode, name: r.name, exclude: excludeLines(r.exclude), live: r.live, after_init: r.afterInit,
})

/** Exclude rules of the server: at most 50 globs, each at most 256 characters, relative, no `..` segment. */
export function excludeError(text: string): string | undefined {
  const lines = excludeLines(text)
  if (lines.length > MAX_BACKUP_EXCLUDE) return `Exclude: at most ${MAX_BACKUP_EXCLUDE} globs`
  for (const [i, line] of lines.entries()) {
    if (line.length > MAX_BACKUP_EXCLUDE_CHARS) return `Exclude line ${i + 1}: at most ${MAX_BACKUP_EXCLUDE_CHARS} characters`
    if (line.startsWith('/') || line.split('/').includes('..')) return `Exclude line ${i + 1}: must be relative with no '..' segment`
  }
  return undefined
}

/** Per-row errors (the server renders and validates the name template; only presence and length are checked here); undefined when all are fine. */
export function backupRowErrors(rows: readonly BackupRow[]): (string | undefined)[] | undefined {
  const errors = rows.map((r): string | undefined => {
    const path = r.path.trim()
    if (path === '') return 'Path is required (use . for the whole root)'
    if (path.startsWith('/') || path.split('/').includes('..')) return "Path must be relative with no '..' segment"
    if (r.name.trim() === '') return 'Name is required'
    if (r.name.length > MAX_BACKUP_NAME) return `Name: at most ${MAX_BACKUP_NAME} characters`
    return excludeError(r.exclude)
  })
  return errors.some(Boolean) ? errors : undefined
}
