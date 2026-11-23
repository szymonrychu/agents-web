// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { SessionView } from '../api/client'
import { theme } from '../theme'
import { BackupWarnings, backupWarnings } from './BackupWarnings'

afterEach(cleanup)

const rec = (state: string, name: string | null = 'skills/infra') => ({ state, name, version: null, at: '2026-11-16T10:00:00Z' })
const session = (entries: unknown[], o: Partial<SessionView> = {}): SessionView =>
  ({ id: 's1', slug: 'alpha', desired: 'active', status: { backup: { entries } }, ...o }) as unknown as SessionView
const mount = (s: SessionView) => render(<ThemeProvider theme={theme}><BackupWarnings session={s} /></ThemeProvider>)

describe('BackupWarnings', () => {
  test('session page shows missing restore warning', () => {
    mount(session([{ index: 0, restore: rec('missing') }]))
    expect(screen.getByRole('status').textContent).toContain('Entry 1 (skills/infra): no backup of this name exists yet, the directory was left as it is')
  })

  test('shows unreadable, skipped_dirty and refused_secret', () => {
    mount(session([
      { index: 0, restore: rec('unreadable', 'a') },
      { index: 1, restore: rec('restored', 'b'), live_delivery: rec('skipped_dirty', 'b') },
      { index: 2, save: rec('refused_secret', 'c') },
    ]))
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('Entry 1 (a): the backup could not be read, the directory was left as it is')
    expect(text).toContain('Entry 2 (b): a new version was not delivered because this session has unsaved changes; save them (orchestrator_volume_save) or the next save makes yours current')
    expect(text).toContain('Entry 3 (c): not saved, it holds a secret')
  })

  test('is hidden without warnings, healthy states and when deleting', () => {
    expect(backupWarnings(session([{ index: 0, restore: rec('restored'), save: rec('uploaded') }]))).toEqual([])
    expect(backupWarnings({ ...session([]), status: {} } as SessionView)).toEqual([])
    const none = mount(session([{ index: 0, restore: rec('restored') }]))
    expect(none.container.textContent).toBe('')
    none.unmount()
    expect(mount(session([{ index: 0, restore: rec('missing') }], { desired: 'deleting' })).container.textContent).toBe('')
  })

  test('shows a failed restore with its reason', () => {
    mount(session([
      { index: 0, restore: { ...rec('failed', 'skills/infra'), reason: 'storage unavailable' } },
      { index: 1, restore: rec('failed', 'b') },
      { index: 2, restore: rec('missing', 'c') },
    ]))
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('Entry 1 (skills/infra): the restore failed (storage unavailable), the directory was left as it is')
    expect(text).toContain('Entry 2 (b): the restore failed, the directory was left as it is')
    expect(text).toContain('Entry 3 (c): no backup of this name exists yet')
  })
})
