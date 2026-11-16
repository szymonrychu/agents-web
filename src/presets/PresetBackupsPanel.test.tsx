// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { BackupEntry } from '../backups/backupEntries'
import { theme } from '../theme'
import { PresetBackupsPanel, backupsLink } from './PresetBackupsPanel'

afterEach(cleanup)

const entry = (name: string, o: Partial<BackupEntry> = {}): BackupEntry => ({ root: 'claude', path: 'skills', mode: 'both', name, exclude: [], live: false, after_init: false, ...o })
const wrap = (entries: BackupEntry[]) => render(<ThemeProvider theme={theme}><PresetBackupsPanel entries={entries} /></ThemeProvider>)

describe('PresetBackupsPanel', () => {
  test('panel links to filtered backups page', () => {
    wrap([entry('skills/infra'), entry('notes/a b')])
    expect(screen.getByRole('link', { name: 'skills/infra' }).getAttribute('href')).toBe('/?view=backups&name=skills%2Finfra')
    expect(screen.getByRole('link', { name: 'notes/a b' }).getAttribute('href')).toBe('/?view=backups&name=notes%2Fa%20b')
    expect(backupsLink('x')).toBe('/?view=backups&name=x')
  })

  test('a templated name is shown as the template, not linked', () => {
    wrap([entry('chat/{{ slug }}')])
    expect(screen.getByText('chat/{{ slug }}')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('template')).toBeTruthy()
  })

  test('says so when the preset has no entries', () => {
    wrap([])
    expect(screen.getByText('This preset has no backup entries.')).toBeTruthy()
  })
})
