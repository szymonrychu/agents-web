/** Helpers for the attachment chip of a room message. */
import type { MessageView } from './api'

const LABELS: Record<string, string> = { image: 'photo', sticker: 'sticker', video: 'video', audio: 'audio', file: 'file' }

export const mediaLabel = (kind: string): string => LABELS[kind] ?? 'file'

/** Binary size with 1024-based rounding, such as "179 KB". */
export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  if (i === 0) return `${n} B`
  const r = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10
  return `${r} ${units[i]}`
}

/** Chip text such as "photo, 179 KB, attached", or null for a row without media. */
export function mediaChipText(m: Pick<MessageView, 'media_kind' | 'media_size' | 'media_status' | 'media_reason'>): string | null {
  if (!m.media_kind) return null
  const parts = [mediaLabel(m.media_kind)]
  if (m.media_size != null) parts.push(formatBytes(m.media_size))
  if (m.media_status === 'attached') parts.push('attached')
  else if (m.media_status === 'not_attached') parts.push(m.media_reason ? `not attached: ${m.media_reason}` : 'not attached')
  return parts.join(', ')
}
