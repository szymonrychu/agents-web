/**
 * Keeps the shell above the on-screen keyboard: on touch or small viewports, the visual viewport's height and offset are
 * written to --app-height, --app-top and --app-shift (the translate of #root) on <html>; index.css applies them to #root
 * and the theme to modal roots. dvh ignores the keyboard on iOS and interactive-widget is not supported there, so the
 * visual viewport is the only signal.
 */
import { useEffect } from 'react'
import { useTouchOrSmall } from './useLayout'

const HEIGHT = '--app-height'
const TOP = '--app-top'
const SHIFT = '--app-shift'

export function useVisualViewport(): void {
  const active = useTouchOrSmall()
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const style = document.documentElement.style
    const write = () => {
      style.setProperty(HEIGHT, `${Math.round(vv.height)}px`)
      const top = Math.round(vv.offsetTop)
      style.setProperty(TOP, `${top}px`)
      style.setProperty(SHIFT, `translateY(${top}px)`)
    }
    // One write per frame: resize and scroll fire in bursts while the keyboard animates.
    let frame: number | null = null
    const schedule = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        write()
      })
    }
    write()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      if (frame !== null) cancelAnimationFrame(frame)
      style.removeProperty(HEIGHT)
      style.removeProperty(TOP)
      style.removeProperty(SHIFT)
    }
  }, [active])
}
