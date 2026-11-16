// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import { BackupEntriesEditor } from './BackupEntriesEditor'
import { blankBackupRow, entryFromRow, rowFromEntry } from './backupEntries'
import type { BackupEntry, BackupRow } from './backupEntries'

let restoreRange: () => void = () => {}
beforeAll(() => { restoreRange = stubRangeRects() })
afterAll(() => restoreRange())
afterEach(cleanup)

const ROW: BackupRow = { root: 'claude', path: 'skills', mode: 'both', name: 'skills/{{ project }}', exclude: '*.tmp', live: true, afterInit: false }
const setup = (rows: BackupRow[] = [], o: Partial<React.ComponentProps<typeof BackupEntriesEditor>> = {}) => {
  const onChange = vi.fn()
  render(<ThemeProvider theme={theme}><BackupEntriesEditor rows={rows} onChange={onChange} {...o} /></ThemeProvider>)
  return onChange
}

describe('BackupEntriesEditor', () => {
  test('says the workspace is discarded unless an entry lists it, with no default entries', () => {
    setup()
    expect(screen.getByText('The workspace is discarded unless an entry lists it.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Backup entry 1' })).toBeNull()
  })

  test('has no restore-only text and no merge field', () => {
    setup([ROW])
    expect(screen.queryByText(/restore-only|restore only|nothing is saved/i)).toBeNull()
    expect(screen.queryByLabelText(/merge/i)).toBeNull()
  })

  test('a row shows root, path, mode, name, exclude, live and after init', () => {
    setup([ROW])
    const row = within(screen.getByRole('group', { name: 'Backup entry 1' }))
    expect((screen.getByLabelText('Entry 1 path') as HTMLInputElement).value).toBe('skills')
    expect(screen.getByLabelText('Entry 1 root')).toBeTruthy()
    expect(screen.getByLabelText('Entry 1 mode')).toBeTruthy()
    expect(row.getByRole('group', { name: 'Entry 1 name' })).toBeTruthy()
    expect((screen.getByLabelText('Entry 1 exclude (one glob per line)') as HTMLTextAreaElement).value).toBe('*.tmp')
    expect((screen.getByLabelText('Entry 1 live') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Entry 1 after init') as HTMLInputElement).checked).toBe(false)
  })

  test('Add entry appends a blank row and a remove button drops one', async () => {
    const onChange = setup([ROW])
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(onChange).toHaveBeenCalledWith([ROW, blankBackupRow()])
    await userEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  test('editing the path changes only that field', async () => {
    const onChange = setup([ROW])
    await userEvent.type(screen.getByLabelText('Entry 1 path'), 's')
    expect(onChange).toHaveBeenLastCalledWith([{ ...ROW, path: 'skillss' }])
  })

  test('shows the row error', () => {
    setup([ROW], { errors: ['Name is required'] })
    expect(screen.getByText('Name is required')).toBeTruthy()
  })

  test('entries round trip spec -> form -> spec', () => {
    const entry: BackupEntry = { root: 'workspace', path: '.', mode: 'backup', name: 'ws/{{ slug }}', exclude: ['a', 'b/*'], live: false, after_init: true }
    expect(entryFromRow(rowFromEntry(entry))).toEqual(entry)
    const bare: BackupEntry = { root: 'claude', path: 'rules', mode: 'restore', name: 'rules', exclude: [], live: false, after_init: false }
    expect(entryFromRow(rowFromEntry(bare))).toEqual(bare)
  })
})
