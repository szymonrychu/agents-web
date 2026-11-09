import type { EntryView } from './api'

/** A preset env row that points at a vault entry env instead of carrying a value. */
export interface VaultRef {
  vault: string
  env: string
}

export const PROJECT_PREFIX = 'project:'

export function isVaultRef(v: unknown): v is VaultRef {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const keys = Object.keys(v)
  const r = v as Record<string, unknown>
  return keys.length === 2 && typeof r.vault === 'string' && typeof r.env === 'string'
}

/** The preset's labels plus `project:<project>`, deduplicated, order kept. */
export function effectiveLabels(labels: string[], project: string): string[] {
  return [...new Set([...labels, PROJECT_PREFIX + project])]
}

/** The `project:` labels of an entry; other labels are descriptive tags. */
export function projectScope(entryLabels: string[]): string[] {
  return entryLabels.filter((l) => l.startsWith(PROJECT_PREFIX))
}

/** Only `project:` entry labels restrict: allowed when none, or one is in the target labels. */
export function entryAllowed(entryLabels: string[], target: string[]): boolean {
  const scope = projectScope(entryLabels)
  return scope.length === 0 || scope.some((l) => target.includes(l))
}

export function refText(ref: VaultRef, byId: ReadonlyMap<string, EntryView>): string {
  const entry = byId.get(ref.vault)
  return `${entry ? entry.name : `vault ${ref.vault.slice(0, 8)}`} / ${ref.env}`
}
