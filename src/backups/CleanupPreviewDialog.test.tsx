// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setViewport } from '../test/viewport'
import type { CleanupPreview } from '../api/archives'
import { theme } from '../theme'
import { CleanupPreviewDialog } from './CleanupPreviewDialog'

const api = vi.hoisted(() => ({ cleanupPreview: vi.fn() }))
vi.mock('../api/archives', async (orig) => ({ ...(await orig<typeof import('../api/archives')>()), ...api }))

const preview = (o: Partial<CleanupPreview> = {}): CleanupPreview => ({
  would_delete: [{ key: 'p/old-1.tar.zst', size: 2048, reason: 'older than 30 days' }, { key: 'p/old-2.tar.zst', size: 1048576, reason: 'beyond newest 3' }],
  count: 2, total_bytes: 1050624, retention_days: 30, keep_newest: 3, grace_seconds: 3600, sweep_enabled: true, sweep_dry_run: true, last_sweep: null, ...o,
})
const mount = (onClose = vi.fn()) => render(<ThemeProvider theme={theme}><CleanupPreviewDialog open onClose={onClose} /></ThemeProvider>)

beforeEach(() => {
  setViewport(1440)
  api.cleanupPreview.mockReset()
})
afterEach(cleanup)

describe('CleanupPreviewDialog', () => {
  test('lists the would-delete rows with reasons and the totals, deleting nothing', async () => {
    api.cleanupPreview.mockResolvedValue(preview())
    mount()
    const dialog = await screen.findByRole('dialog', { name: 'Cleanup preview' })
    await waitFor(() => expect(within(dialog).getByText('p/old-1.tar.zst')).toBeTruthy())
    expect(within(dialog).getByText('older than 30 days')).toBeTruthy()
    expect(within(dialog).getByText('beyond newest 3')).toBeTruthy()
    expect(within(dialog).getByText('2 archives, 1.0 MiB would be deleted')).toBeTruthy()
    expect(within(dialog).getByText(/Keep archives newer than 30 days and the newest 3 per name/)).toBeTruthy()
    expect(within(dialog).getByText('Sweep is on, in dry-run mode: nothing is deleted automatically')).toBeTruthy()
  })

  test('says so when nothing would be deleted', async () => {
    api.cleanupPreview.mockResolvedValue(preview({ would_delete: [], count: 0, total_bytes: 0, sweep_enabled: false }))
    mount()
    expect(await screen.findByText('Nothing would be deleted')).toBeTruthy()
    expect(screen.getByText('Sweep is off')).toBeTruthy()
  })

  test('shows a load failure and closes on Close', async () => {
    api.cleanupPreview.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    mount(onClose)
    expect(await screen.findByText('boom')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CleanupPreviewDialog layouts', () => {
  test('on phones each archive is a card with its size and reason', async () => {
    setViewport(375, { coarse: true })
    api.cleanupPreview.mockResolvedValue(preview())
    mount()
    const card = await screen.findByRole('article', { name: 'Archive p/old-1.tar.zst' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(within(card).getByText('p/old-1.tar.zst')).toBeTruthy()
    for (const label of ['Size', 'Reason']) expect(within(card).getByText(label, { selector: 'dt' })).toBeTruthy()
    expect(within(card).getByText('2.0 KiB')).toBeTruthy()
    expect(within(card).getByText('older than 30 days')).toBeTruthy()
  })

  test('on a wide screen it is a table with every column', async () => {
    api.cleanupPreview.mockResolvedValue(preview())
    mount()
    await screen.findByText('p/old-1.tar.zst')
    const table = screen.getByRole('table', { name: 'Cleanup preview' })
    for (const h of ['Archive', 'Size', 'Reason']) expect(within(table).getByRole('columnheader', { name: h })).toBeTruthy()
  })
})
