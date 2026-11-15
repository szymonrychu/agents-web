/** Touch key bar above the terminal: Esc, Tab, a sticky Ctrl and the arrows, which an on-screen keyboard lacks. */
import type { ReactNode, SyntheticEvent } from 'react'
import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { KEY_SEQUENCES } from './keys'
import type { KeyName } from './keys'

export interface KeyBarProps {
  ctrl: boolean
  onCtrl: (next: boolean) => void
  onKey: (seq: string) => void
}

/** Holding an arrow repeats it, like a hardware key: first repeat after the delay, then one per interval. */
export const REPEAT_DELAY_MS = 400
export const REPEAT_INTERVAL_MS = 60

// The terminal keeps focus (and the on-screen keyboard stays up) when a key is pressed.
const keepFocus = (e: SyntheticEvent) => e.preventDefault()

const KEYS: { name: KeyName; label: ReactNode; repeats?: boolean }[] = [
  { name: 'Esc', label: 'Esc' },
  { name: 'Tab', label: 'Tab' },
  { name: 'Up', label: <KeyboardArrowUpIcon fontSize="small" />, repeats: true },
  { name: 'Down', label: <KeyboardArrowDownIcon fontSize="small" />, repeats: true },
  { name: 'Left', label: <KeyboardArrowLeftIcon fontSize="small" />, repeats: true },
  { name: 'Right', label: <KeyboardArrowRightIcon fontSize="small" />, repeats: true },
]

export function KeyBar({ ctrl, onCtrl, onKey }: KeyBarProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // set once a hold has repeated, so the click that ends the hold sends nothing more
  const repeated = useRef(false)
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  const hold = (e: SyntheticEvent, seq: string) => {
    keepFocus(e)
    stop()
    repeated.current = false
    const tick = (wait: number) => {
      timer.current = setTimeout(() => {
        repeated.current = true
        onKey(seq)
        tick(REPEAT_INTERVAL_MS)
      }, wait)
    }
    tick(REPEAT_DELAY_MS)
  }
  const click = (seq: string) => {
    if (repeated.current) {
      repeated.current = false
      return
    }
    onKey(seq)
  }

  const key = ({ name, label, repeats }: (typeof KEYS)[number]) => {
    const seq = KEY_SEQUENCES[name]
    return (
      <Button
        key={name}
        size="small"
        variant="outlined"
        aria-label={name}
        onPointerDown={repeats ? (e) => hold(e, seq) : keepFocus}
        onPointerUp={repeats ? stop : undefined}
        onPointerCancel={repeats ? stop : undefined}
        onPointerLeave={repeats ? stop : undefined}
        onMouseDown={keepFocus}
        onClick={() => (repeats ? click(seq) : onKey(seq))}
        sx={{ flexShrink: 0 }}
      >
        {label}
      </Button>
    )
  }
  return (
    <Box role="toolbar" aria-label="Terminal keys" sx={{ display: 'flex', gap: 1, py: 1, overflowX: 'auto', flexShrink: 0 }}>
      {key(KEYS[0])}
      {key(KEYS[1])}
      <Button size="small" variant={ctrl ? 'contained' : 'outlined'} aria-pressed={ctrl} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onCtrl(!ctrl)} sx={{ flexShrink: 0 }}>
        Ctrl
      </Button>
      {KEYS.slice(2).map(key)}
    </Box>
  )
}
