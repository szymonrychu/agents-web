import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refresh: () => Promise<void>
}

const visible = () => document.visibilityState !== 'hidden'

/**
 * Calls `fn` now and every `intervalMs` while the document is visible; stops on unmount.
 * Calls never overlap: a tick or refresh while one is in flight is skipped. A deps change discards the
 * in-flight result and fetches for the new deps at once.
 */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: readonly unknown[]): PollResult<T> {
  const [state, setState] = useState<{ data: T | undefined; error: Error | undefined; loading: boolean }>({ data: undefined, error: undefined, loading: true })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const generation = useRef(0)
  const inFlight = useRef<number | undefined>(undefined)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const mine = generation.current
    if (inFlight.current === mine) return
    inFlight.current = mine
    const current = () => alive.current && generation.current === mine
    try {
      const data = await fnRef.current()
      if (current()) setState({ data, error: undefined, loading: false })
    } catch (e) {
      if (current()) setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)), loading: false }))
    } finally {
      if (inFlight.current === mine) inFlight.current = undefined
    }
  }, [])

  useEffect(() => {
    alive.current = true
    generation.current++
    setState((s) => ({ ...s, loading: true }))
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      void refresh()
      timer = setInterval(() => void refresh(), intervalMs)
    }
    const onVisibility = () => (visible() ? start() : stop())
    if (visible()) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive.current = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, refresh, ...deps])

  return { ...state, refresh }
}
