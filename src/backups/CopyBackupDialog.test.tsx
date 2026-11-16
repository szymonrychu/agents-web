// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { CopyBackupDialog } from './CopyBackupDialog'

const api = vi.hoisted(() => ({ copyBackup: vi.fn() }))
vi.mock('../api/backups', async (orig) => ({ ...(await orig<typeof import('../api/backups')>()), ...api }))

const mount = (props: Partial<React.ComponentProps<typeof CopyBackupDialog>> = {}) => {
  const onClose = vi.fn()
  const onCopied = vi.fn()
  render(<ThemeProvider theme={theme}><CopyBackupDialog open source="team-a" onClose={onClose} onCopied={onCopied} {...props} /></ThemeProvider>)
  return { onClose, onCopied }
}

beforeEach(() => {
  api.copyBackup.mockReset()
})
afterEach(cleanup)

describe('CopyBackupDialog', () => {
  test('posts source, version and target, then reports the copy', async () => {
    api.copyBackup.mockResolvedValue({ id: 'v9' })
    const { onCopied } = mount({ sourceVersion: 'v1' })
    const dialog = await screen.findByRole('dialog', { name: 'Copy backup' })
    expect(within(dialog).getByText(/Replaces the current version of the target/)).toBeTruthy()
    expect(within(dialog).queryByText(/merge$/i)).toBeNull()
    await userEvent.type(within(dialog).getByLabelText('Target name'), 'team-b')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(api.copyBackup).toHaveBeenCalledWith({ source: 'team-a', sourceVersion: 'v1', target: 'team-b' }))
    expect(onCopied).toHaveBeenCalled()
  })

  test('copies the current version when none is given', async () => {
    api.copyBackup.mockResolvedValue({ id: 'v9' })
    mount()
    await userEvent.type(await screen.findByLabelText('Target name'), 'team-b')
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(api.copyBackup).toHaveBeenCalledWith({ source: 'team-a', sourceVersion: undefined, target: 'team-b' }))
  })

  test('Copy stays disabled until a target is typed', async () => {
    mount()
    expect((await screen.findByRole('button', { name: 'Copy' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('shows the server error and stays open', async () => {
    api.copyBackup.mockRejectedValue(new ApiError(409, 'protected', 'target is protected'))
    const { onCopied } = mount()
    await userEvent.type(await screen.findByLabelText('Target name'), 'team-b')
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText(/target is protected/)).toBeTruthy()
    expect(onCopied).not.toHaveBeenCalled()
  })
})
