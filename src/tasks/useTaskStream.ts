import { useEffect, useRef } from 'react'
import { openStream } from '../api/stream'
import { taskStreamUrl } from './api'

/**
 * Calls `onChange(key)` for every `task_changed` event of the taskboard stream. A NOTIFY is only a hint, so callers also poll
 * (see `usePoll`, 10 s); the stream just makes the update immediate.
 */
export function useTaskStream(onChange: (key: string) => void): void {
  const ref = useRef(onChange)
  useEffect(() => {
    ref.current = onChange
  })
  useEffect(() => {
    let url: string
    try {
      url = taskStreamUrl()
    } catch {
      return // the taskboard backend is not configured: the pages show the poll's error
    }
    const stream = openStream(url, {
      eventNames: ['task_changed'],
      onEvent: (data) => {
        const key = (data as { key?: unknown } | null)?.key
        if (typeof key === 'string') ref.current(key)
      },
    })
    return () => stream.close()
  }, [])
}
