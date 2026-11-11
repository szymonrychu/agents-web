import { useEffect, useRef } from 'react'
import { openStream } from '../api/stream'
import { specStreamUrl } from './api'

export interface SpecEvent {
  /** `reset` means the cursor fell off the kept events: refetch everything. */
  type: 'spec_changed' | 'reset'
  key?: string
  path?: string
  version?: number
  commentId?: number
  deleted?: boolean
}

/**
 * Calls `onChange` for every `spec_changed` and `reset` event of the taskboard stream. A NOTIFY is only a hint, so callers
 * also poll (see `usePoll`, 10 s); the stream just makes the update immediate.
 */
export function useSpecStream(onChange: (ev: SpecEvent) => void): void {
  const ref = useRef(onChange)
  useEffect(() => {
    ref.current = onChange
  })
  useEffect(() => {
    let url: string
    try {
      url = specStreamUrl()
    } catch {
      return // the taskboard backend is not configured: the pages show the poll's error
    }
    const stream = openStream(url, {
      eventNames: ['spec_changed', 'reset'],
      onEvent: (data, info) => {
        if (info.type === 'reset') return ref.current({ type: 'reset' })
        const d = (data ?? {}) as { key?: unknown; path?: unknown; version?: unknown; comment_id?: unknown; deleted?: unknown }
        if (typeof d.key !== 'string') return
        ref.current({
          type: 'spec_changed',
          key: d.key,
          path: typeof d.path === 'string' ? d.path : undefined,
          version: typeof d.version === 'number' ? d.version : undefined,
          commentId: typeof d.comment_id === 'number' ? d.comment_id : undefined,
          deleted: d.deleted === true,
        })
      },
    })
    return () => stream.close()
  }, [])
}
