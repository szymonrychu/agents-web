import { useEffect, useState } from 'react'

/** A counter that increments each time the window regains focus; use it as an effect dep to reload on return. */
export function useFocusTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener('focus', bump)
    return () => window.removeEventListener('focus', bump)
  }, [])
  return tick
}
