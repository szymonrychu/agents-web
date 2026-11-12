import { useEffect, useRef } from 'react'
import { openStream } from '../api/stream'
import { mindmapStreamUrl } from './api'

export interface MindmapEvent {
  /** `reset` means the cursor fell off the kept events: refetch everything. */
  type: 'mindmap_changed' | 'reset'
  project?: string
  map?: string | null
  node?: string | null
  kind?: string
}

/**
 * Calls `onChange` for every `mindmap_changed` and `reset` event of the mindmap stream (all projects when `project` is null).
 * Events carry keys only, never text, so a caller refetches what it shows.
 */
export function useMindmapStream(project: string | null, onChange: (ev: MindmapEvent) => void): void {
  const ref = useRef(onChange)
  useEffect(() => {
    ref.current = onChange
  })
  useEffect(() => {
    let url: string
    try {
      url = mindmapStreamUrl(project)
    } catch {
      return // the mindmap backend is not configured
    }
    const stream = openStream(url, {
      eventNames: ['mindmap_changed', 'reset'],
      onEvent: (data, info) => {
        if (info.type === 'reset') return ref.current({ type: 'reset' })
        const d = (data ?? {}) as { project?: unknown; map?: unknown; node?: unknown; kind?: unknown }
        ref.current({
          type: 'mindmap_changed',
          project: typeof d.project === 'string' ? d.project : undefined,
          map: typeof d.map === 'string' ? d.map : null,
          node: typeof d.node === 'string' ? d.node : null,
          kind: typeof d.kind === 'string' ? d.kind : undefined,
        })
      },
    })
    return () => stream.close()
  }, [project])
}
