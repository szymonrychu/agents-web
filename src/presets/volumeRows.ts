/** Form rows of spec.volumes: one attachment per row; an empty mount path leaves the server default (/volumes/<name>). */
import type { components } from '../api/schema'

export type VolumeAttachment = components['schemas']['VolumeAttachment']

export interface VolumeRow {
  volume: string
  /** Empty means the default /volumes/<name>. */
  mountPath: string
  mode: 'ro' | 'rw'
  backupRestore: boolean
}

export const rowFromAttachment = (a: VolumeAttachment): VolumeRow => ({ volume: a.volume, mountPath: a.mount_path ?? '', mode: a.mode, backupRestore: a.backup_restore })

export const attachmentFromRow = (r: VolumeRow): VolumeAttachment => ({
  volume: r.volume,
  mode: r.mode,
  backup_restore: r.backupRestore,
  ...(r.mountPath.trim() !== '' ? { mount_path: r.mountPath.trim() } : {}),
})

export const defaultMountPath = (name: string) => `/volumes/${name}`

/** The server refuses a relative path, `..`, `/` and a leading `//`. */
export function mountPathError(path: string): string | undefined {
  const p = path.trim()
  if (p === '') return undefined
  if (!p.startsWith('/')) return 'Mount path must be absolute'
  if (p === '/' || p.startsWith('//')) return 'Mount path must not be / or start with //'
  if (p.split('/').includes('..')) return 'Mount path must not contain ..'
  return undefined
}

/** A path that shadows a config directory of the agent: /claude or anything with a .claude segment. */
export const shadowsConfig = (path: string) => /^\/claude(\/|$)/.test(path) || path.split('/').includes('.claude')

/** Per-row error (undefined when fine), or undefined when no row has one. Duplicates are checked on the effective path. */
export function volumeRowErrors(rows: VolumeRow[], names: Map<string, string> = new Map()): (string | undefined)[] | undefined {
  const eff = (r: VolumeRow) => (r.mountPath.trim() !== '' ? r.mountPath.trim() : names.has(r.volume) ? defaultMountPath(names.get(r.volume) as string) : '')
  const errors = rows.map((r, i) => {
    if (r.volume === '') return 'Pick a volume'
    const bad = mountPathError(r.mountPath)
    if (bad) return bad
    const path = eff(r)
    if (path !== '' && rows.some((o, j) => j !== i && eff(o) === path)) return 'Mount path is used by another attachment'
    return undefined
  })
  return errors.some(Boolean) ? errors : undefined
}
