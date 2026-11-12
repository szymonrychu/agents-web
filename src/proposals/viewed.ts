/**
 * "Viewed" marks of proposal items, a personal reading aid like GitHub's: per viewer in this browser's localStorage,
 * never sent to the server. Keyed by proposal, revision and path, so a new revision starts unviewed. Storage may be
 * missing or throw (private mode, blocked site data): it then reads as unviewed and writes are dropped.
 */
import { useCallback, useState } from 'react'

export const viewedKey = (proposalId: number, revision: number, path: string): string => `agents-web:proposal-viewed:${proposalId}:${revision}:${path}`

export function readViewed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeViewed(key: string, viewed: boolean): void {
  try {
    if (viewed) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // the mark is a convenience: without storage it lasts until the dialog closes
  }
}

/** The viewed mark of `key` and its setter; without a key it is always false and never touches storage. */
export function useViewed(key: string | undefined): [boolean, (v: boolean) => void] {
  const [viewed, setState] = useState(() => (key === undefined ? false : readViewed(key)))
  const set = useCallback(
    (v: boolean) => {
      if (key === undefined) return
      setState(v)
      writeViewed(key, v)
    },
    [key],
  )
  return [viewed, set]
}
