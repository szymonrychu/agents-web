/** Touch key bar above the terminal: Esc, Tab, a sticky Ctrl and the arrows, which an on-screen keyboard lacks. */
import type { ReactNode, SyntheticEvent } from 'react'
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

// The terminal keeps focus (and the on-screen keyboard stays up) when a key is pressed.
const keepFocus = (e: SyntheticEvent) => e.preventDefault()

const KEYS: { name: KeyName; label: ReactNode }[] = [
  { name: 'Esc', label: 'Esc' },
  { name: 'Tab', label: 'Tab' },
  { name: 'Up', label: <KeyboardArrowUpIcon fontSize="small" /> },
  { name: 'Down', label: <KeyboardArrowDownIcon fontSize="small" /> },
  { name: 'Left', label: <KeyboardArrowLeftIcon fontSize="small" /> },
  { name: 'Right', label: <KeyboardArrowRightIcon fontSize="small" /> },
]

export function KeyBar({ ctrl, onCtrl, onKey }: KeyBarProps) {
  const key = (name: KeyName, label: ReactNode) => (
    <Button key={name} size="small" variant="outlined" aria-label={name} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onKey(KEY_SEQUENCES[name])} sx={{ flexShrink: 0 }}>
      {label}
    </Button>
  )
  return (
    <Box role="toolbar" aria-label="Terminal keys" sx={{ display: 'flex', gap: 1, py: 1, overflowX: 'auto', flexShrink: 0 }}>
      {key(KEYS[0].name, KEYS[0].label)}
      {key(KEYS[1].name, KEYS[1].label)}
      <Button size="small" variant={ctrl ? 'contained' : 'outlined'} aria-pressed={ctrl} onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => onCtrl(!ctrl)} sx={{ flexShrink: 0 }}>
        Ctrl
      </Button>
      {KEYS.slice(2).map((k) => key(k.name, k.label))}
    </Box>
  )
}
