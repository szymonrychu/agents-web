// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import { NodeHistory } from './NodeHistory'
import { nodeView, versionMeta, versionView } from './testUtils'

const api = vi.hoisted(() => ({ listVersions: vi.fn(), getVersion: vi.fn(), patchNode: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('../specs/VersionDiff', () => ({
  VersionDiff: (p: { before: string; after: string; beforeLabel: string; afterLabel: string }) => (
    <div data-testid="diff">{`${p.beforeLabel}|${p.afterLabel}|${p.before}|${p.after}`}</div>
  ),
}))

const onRestored = vi.fn()
const mount = () => render(<ThemeProvider theme={theme}><NodeHistory nodeKey="N-2" rowVersion={7} refreshKey={0} onRestored={onRestored} /></ThemeProvider>)

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset()
  onRestored.mockReset()
  api.listVersions.mockResolvedValue([versionMeta(3, { author: 'agent', summary: 'third' }), versionMeta(2), versionMeta(1)])
  api.getVersion.mockImplementation(async (_k: string, v: number) => versionView(v))
  api.patchNode.mockResolvedValue(nodeView({ version: 8 }))
})
afterEach(cleanup)

describe('NodeHistory', () => {
  test('lists version, author, summary and time', async () => {
    mount()
    const row = (await screen.findByText('third')).closest('li') as HTMLElement
    expect(within(row).getByText('v3')).toBeTruthy()
    expect(within(row).getByText('agent')).toBeTruthy()
    expect(within(row).getByText(/2026/)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  test('views any version', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'View v2' }))
    expect(await screen.findByText('notes of v2')).toBeTruthy()
    expect(api.getVersion).toHaveBeenCalledWith('N-2', 2)
  })

  test('diffs against the previous version', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Diff v3' }))
    expect((await screen.findByTestId('diff')).textContent).toBe('v2|v3|notes of v2|notes of v3')
  })

  test('the first version has no diff button', async () => {
    mount()
    await screen.findByText('third')
    expect(screen.queryByRole('button', { name: 'Diff v1' })).toBeNull()
  })

  test('restore saves that text as a new version with a restore summary', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Restore v2' }))
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledWith('N-2', { version: 7, notes: 'notes of v2', summary: 'restore v2' }))
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
  })

  test('a 409 on restore asks for a reload and does not call onRestored', async () => {
    api.patchNode.mockRejectedValueOnce(new ApiError(409, 'version_conflict', 'stale', { current_version: 9 }))
    const u = userEvent.setup()
    mount()
    await u.click(await screen.findByRole('button', { name: 'Restore v2' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/changed meanwhile/)
    expect(onRestored).not.toHaveBeenCalled()
  })
})
