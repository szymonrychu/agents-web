import { describe, expect, test } from 'vitest'
import type { MessageView } from './api'
import { formatBytes, mediaChipText, mediaLabel } from './media'

const view = (over: Partial<MessageView>): MessageView => ({
  id: '1', at: '2026-11-12T10:00:00Z', body: null, direction: 'in', reason: null, run_id: null, sender: '@a:hs', sender_name: 'Alice', status: 'handled', ...over,
})

describe('media helpers', () => {
  test('formatBytes uses 1024-based rounding', () => {
    expect(formatBytes(183211)).toBe('179 KB')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  test('mediaLabel maps kinds', () => {
    expect(mediaLabel('image')).toBe('photo')
    expect(mediaLabel('sticker')).toBe('sticker')
    expect(mediaLabel('video')).toBe('video')
    expect(mediaLabel('audio')).toBe('audio')
    expect(mediaLabel('file')).toBe('file')
  })

  test('mediaChipText for attached, not attached and no media', () => {
    expect(mediaChipText(view({ media_kind: 'image', media_size: 183211, media_status: 'attached' }))).toBe('photo, 179 KB, attached')
    expect(mediaChipText(view({ media_kind: 'file', media_size: 2048, media_status: 'not_attached', media_reason: 'unsupported_type' }))).toBe('file, 2 KB, not attached: unsupported_type')
    expect(mediaChipText(view({ media_kind: 'video', media_status: 'not_attached' }))).toBe('video, not attached')
    expect(mediaChipText(view({ media_kind: 'audio' }))).toBe('audio')
    expect(mediaChipText(view({}))).toBeNull()
  })
})
