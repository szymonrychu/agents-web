/** One xterm.js screen wired to one terminal attach socket: input, output, fit and reconnect replay; a key bar on touch. */
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import Box from '@mui/material/Box'
import { useEffect, useRef, useState } from 'react'
import { useTouchOrSmall } from '../layout/useLayout'
import { MONO_FONT, TOKENS, terminalTheme } from '../theme'
import { KeyBar } from './KeyBar'
import { applyCtrl } from './keys'
import { openTerminalSocket } from './terminalSocket'
import type { TerminalSocket, TerminalStatus } from './terminalSocket'

export interface XtermViewProps {
  /** The attach WebSocket of the shell. A new url (or a remount) attaches afresh. */
  url: string
  onStatus?: (status: TerminalStatus, reason?: string) => void
}

/** Fills its parent; refits whenever the parent changes size (panel drag, minimize, maximize, tab shown). */
export function XtermView({ url, onStatus }: XtermViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  })
  const compact = useTouchOrSmall()
  const termRef = useRef<Terminal | null>(null)
  const socketRef = useRef<TerminalSocket | null>(null)
  // Ctrl from the key bar applies to exactly one next key; the ref is what term.onData reads.
  const [ctrl, setCtrlState] = useState(false)
  const ctrlRef = useRef(false)
  const setCtrl = (next: boolean) => {
    ctrlRef.current = next
    setCtrlState(next)
  }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const term = new Terminal({ theme: terminalTheme, fontFamily: MONO_FONT, fontSize: TOKENS.fontSizes.md, cursorBlink: true })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(el)

    let opens = 0
    const socket = openTerminalSocket(url, {
      onData: (bytes) => term.write(bytes),
      onExit: (code) => term.writeln(`\r\n[process exited with code ${code ?? 'unknown'}]`),
      onStatus: (status, reason) => {
        // every open after the first is a reconnect, and the wrapper replays the scrollback into it
        if (status === 'open' && ++opens > 1) term.reset()
        onStatusRef.current?.(status, reason)
      },
    })
    term.onData((data) => {
      if (!ctrlRef.current) return socket.send(data)
      ctrlRef.current = false
      setCtrlState(false)
      socket.send(applyCtrl(data))
    })
    termRef.current = term
    socketRef.current = socket

    const fit = () => {
      // a hidden host (inactive tab, minimized panel) has no client size; FitAddon would read its declared
      // 100% as 100px and shrink the PTY to a few cells, so wait until the host is shown again
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      fitAddon.fit()
      socket.resize(term.cols, term.rows)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      termRef.current = null
      socketRef.current = null
      observer.disconnect()
      socket.close()
      term.dispose()
    }
  }, [url])

  const sendKey = (seq: string) => {
    setCtrl(false)
    socketRef.current?.send(seq)
    termRef.current?.focus()
  }

  // One tree on every viewport, so the host (and the terminal opened in it) survives the gate flipping.
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {compact ? <KeyBar ctrl={ctrl} onCtrl={(next) => { setCtrl(next); termRef.current?.focus() }} onKey={sendKey} /> : null}
      <Box ref={host} data-testid="xterm-host" sx={{ width: '100%', flexGrow: 1, minHeight: 0, overflow: 'hidden' }} />
    </Box>
  )
}
