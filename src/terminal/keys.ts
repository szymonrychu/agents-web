/** Byte sequences of the terminal keys an on-screen keyboard lacks, and the Ctrl mapping of a typed character. */
export const KEY_SEQUENCES = { Esc: '\x1b', Tab: '\t', Up: '\x1b[A', Down: '\x1b[B', Right: '\x1b[C', Left: '\x1b[D' } as const

export type KeyName = keyof typeof KEY_SEQUENCES

/** Applies Ctrl to the first character, masking its code to the low five bits (a-z, A-Z, @ [ \ ] ^ _ to their C0 code, ? to DEL, space to NUL); the rest is kept. */
export function applyCtrl(data: string): string {
  if (data === '') return data
  const ch = data[0]
  const rest = data.slice(1)
  if (/^[a-zA-Z@[\\\]^_]$/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) & 31) + rest
  if (ch === '?') return '\x7f' + rest
  if (ch === ' ') return '\x00' + rest
  return data
}
