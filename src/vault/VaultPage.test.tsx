// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { ApiError } from '../api/client'
import type { EntryView } from './api'
import { envNameError, parseLabels } from './validate'
import { VaultPage } from './VaultPage'

const api = vi.hoisted(() => ({
  listEntries: vi.fn(),
  getEntry: vi.fn(),
  createEntry: vi.fn(),
  patchEntry: vi.fn(),
  rotateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  listPins: vi.fn(),
  listEvents: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const TS = '2026-11-01T10:00:00Z'
const entry = (over: Partial<EntryView> = {}): EntryView => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'github',
  description: 'GitHub access',
  labels: ['prod', 'ci'],
  envs: [
    { env: 'GH_USER', protected: false, value: 'octo', updated_at: TS },
    { env: 'GH_TOKEN', protected: true, value: null, updated_at: TS },
  ],
  version: 3,
  created_at: TS,
  updated_at: TS,
  attachments_count: 2,
  pinned_sessions_count: 0,
  behind_count: 0,
  ...over,
})
const other = entry({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'registry',
  description: 'Docker registry',
  labels: ['dev'],
  envs: [{ env: 'REG_URL', protected: false, value: 'https://r.example', updated_at: TS }],
  version: 1,
  attachments_count: 0,
})

const mount = () => render(<ThemeProvider theme={theme}><VaultPage onBack={() => {}} /></ThemeProvider>)
const user = () => userEvent.setup()

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset()
  api.listEntries.mockResolvedValue([entry(), other])
  api.createEntry.mockResolvedValue(entry())
  api.patchEntry.mockResolvedValue({})
  api.rotateEntry.mockResolvedValue(entry())
  api.deleteEntry.mockResolvedValue(undefined)
  api.listPins.mockResolvedValue([])
  api.listEvents.mockResolvedValue([])
})
afterEach(cleanup)

const card = (name: string) => within(screen.getByRole('article', { name: `Entry ${name}` }))
const openCreate = async (u: ReturnType<typeof user>) => {
  await screen.findByText('registry')
  await u.click(screen.getByRole('button', { name: 'New entry' }))
}

describe('validate', () => {
  test('env names', () => {
    expect(envNameError('GH_TOKEN')).toBeUndefined()
    expect(envNameError('')).toMatch(/required/)
    expect(envNameError('gh_token')).toMatch(/A-Z/)
    expect(envNameError('1A')).toMatch(/A-Z/)
    expect(envNameError('A'.repeat(129))).toMatch(/128/)
    expect(envNameError('A', ['A'])).toMatch(/Duplicate/)
  })
  test('labels', () => expect(parseLabels(' a, b ,,a')).toEqual(['a', 'b']))
})

describe('list', () => {
  test('renders mixed readable and protected envs with the version and attachments count', async () => {
    mount()
    await screen.findByText('registry')
    const gh = card('github')
    expect(gh.getByText('GH_USER')).toBeTruthy()
    expect(gh.getByText('octo')).toBeTruthy()
    expect(gh.getByText('set, v3')).toBeTruthy()
    expect(gh.getByText('prod')).toBeTruthy()
    expect(gh.getByText('GitHub access')).toBeTruthy()
    expect(gh.getByText('attachments: 2')).toBeTruthy()
    expect(card('registry').getByText('https://r.example')).toBeTruthy()
    expect(card('registry').queryByRole('button', { name: 'Rotate' })).toBeNull()
  })
  test('filters by text and label', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.type(screen.getByLabelText('Filter'), 'docker')
    expect(screen.queryByRole('article', { name: 'Entry github' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Entry registry' })).toBeTruthy()
    await u.clear(screen.getByLabelText('Filter'))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'ci' } })
    expect(screen.queryByRole('article', { name: 'Entry registry' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Entry github' })).toBeTruthy()
  })
  test('shows the API error code and message', async () => {
    api.listEntries.mockRejectedValue(new ApiError(403, 'forbidden', 'source address not allowed'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('forbidden: source address not allowed')
  })
})

describe('create', () => {
  test('sends readable and protected rows', async () => {
    const u = user()
    mount()
    await openCreate(u)
    await u.type(screen.getByLabelText('Name'), 'new one')
    await u.type(screen.getByLabelText('Labels'), 'a, b')
    const row1 = within(screen.getByRole('group', { name: 'Env row 1' }))
    await u.type(row1.getByLabelText('Env name'), 'API_URL')
    await u.type(row1.getByLabelText('Value'), 'https://x')
    await u.click(screen.getByRole('button', { name: 'Add env' }))
    const row2 = within(screen.getByRole('group', { name: 'Env row 2' }))
    await u.type(row2.getByLabelText('Env name'), 'API_KEY')
    await u.click(row2.getByRole('switch'))
    const secret = row2.getByLabelText('Value') as HTMLInputElement
    expect(secret.type).toBe('password')
    await u.type(secret, 's3cret')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(api.createEntry).toHaveBeenCalledWith({
        name: 'new one',
        description: '',
        labels: ['a', 'b'],
        envs: [
          { env: 'API_URL', protected: false, value: 'https://x' },
          { env: 'API_KEY', protected: true, value: 's3cret' },
        ],
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  test('validates env names and requires protected values on the client', async () => {
    const u = user()
    mount()
    await openCreate(u)
    await u.type(screen.getByLabelText('Name'), 'n')
    const row1 = within(screen.getByRole('group', { name: 'Env row 1' }))
    await u.type(row1.getByLabelText('Env name'), 'bad-name')
    expect(screen.getByText(/Use A-Z, 0-9 and _/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    await u.clear(row1.getByLabelText('Env name'))
    await u.type(row1.getByLabelText('Env name'), 'GOOD')
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(false)
    await u.click(row1.getByRole('switch'))
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.createEntry).not.toHaveBeenCalled()
  })
  test('adds and removes rows, keeping at least one', async () => {
    const u = user()
    mount()
    await openCreate(u)
    expect((screen.getByRole('button', { name: 'Remove env 1' }) as HTMLButtonElement).disabled).toBe(true)
    await u.click(screen.getByRole('button', { name: 'Add env' }))
    expect(screen.getAllByRole('group', { name: /Env row/ })).toHaveLength(2)
    await u.click(screen.getByRole('button', { name: 'Remove env 1' }))
    expect(screen.getAllByRole('group', { name: /Env row/ })).toHaveLength(1)
  })
  test('loads a protected value from a file', async () => {
    const u = user()
    mount()
    await openCreate(u)
    await u.click(within(screen.getByRole('group', { name: 'Env row 1' })).getByRole('switch'))
    const file = new File(['QUJDRA==\n'], 'key.b64', { type: 'text/plain' })
    await u.upload(screen.getByTestId('file-Value'), file)
    await waitFor(() => expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('QUJDRA=='))
  })
  test('shows the API error and clears secrets when the dialog is closed', async () => {
    api.createEntry.mockRejectedValue(new ApiError(409, 'vault_name_taken', 'name taken'))
    const u = user()
    mount()
    await openCreate(u)
    await u.type(screen.getByLabelText('Name'), 'github')
    const row1 = within(screen.getByRole('group', { name: 'Env row 1' }))
    await u.type(row1.getByLabelText('Env name'), 'K')
    await u.click(row1.getByRole('switch'))
    await u.type(row1.getByLabelText('Value'), 'topsecret')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    expect((await screen.findByRole('alert')).textContent).toContain('vault_name_taken: name taken')
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await u.click(screen.getByRole('button', { name: 'New entry' }))
    const again = within(screen.getByRole('group', { name: 'Env row 1' }))
    expect((again.getByLabelText('Value') as HTMLInputElement).value).toBe('')
    expect(document.body.textContent).not.toContain('topsecret')
  })
})

describe('duplicate as new', () => {
  test('prefills name copy, description, labels and rows with empty protected values', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Duplicate as new' }))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('github copy')
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('GitHub access')
    expect((screen.getByLabelText('Labels') as HTMLInputElement).value).toBe('prod, ci')
    const r1 = within(screen.getByRole('group', { name: 'Env row 1' }))
    const r2 = within(screen.getByRole('group', { name: 'Env row 2' }))
    expect((r1.getByLabelText('Env name') as HTMLInputElement).value).toBe('GH_USER')
    expect((r1.getByLabelText('Value') as HTMLInputElement).value).toBe('octo')
    expect((r2.getByLabelText('Env name') as HTMLInputElement).value).toBe('GH_TOKEN')
    expect((r2.getByLabelText('Value') as HTMLInputElement).value).toBe('')
    expect((r2.getByRole('switch') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('protected toggle', () => {
  test('toggling Protected clears the typed value in both directions', async () => {
    const u = user()
    mount()
    await openCreate(u)
    const row = within(screen.getByRole('group', { name: 'Env row 1' }))
    await u.type(row.getByLabelText('Value'), 'plain')
    await u.click(row.getByRole('switch'))
    expect((row.getByLabelText('Value') as HTMLInputElement).value).toBe('')
    await u.type(row.getByLabelText('Value'), 'hidden')
    await u.click(row.getByRole('switch'))
    const field = row.getByLabelText('Value') as HTMLInputElement
    expect(field.type).toBe('text')
    expect(field.value).toBe('')
  })
})

describe('reload', () => {
  test('a failed reload clears the stale entries', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    api.listEntries.mockRejectedValue(new ApiError(503, 'unavailable', 'down'))
    await u.click(card('registry').getByRole('button', { name: 'Delete' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Entry registry' })).toBeNull())
    expect((await screen.findByRole('alert')).textContent).toContain('unavailable: down')
  })
  test('the open detail panel refreshes after an edit', async () => {
    const detail = (name: string) => ({ ...entry(), name, versions: [], attachments: [], mismatched_attachments: [] })
    api.getEntry.mockResolvedValueOnce(detail('github')).mockResolvedValue(detail('github-renamed'))
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Details' }))
    await within(await screen.findByRole('region', { name: 'Entry detail' })).findByText('github (v3)')
    await u.click(card('github').getByRole('button', { name: 'Edit' }))
    await u.type(screen.getByLabelText('Name'), '-renamed')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await within(screen.getByRole('region', { name: 'Entry detail' })).findByText('github-renamed (v3)')
  })
})

describe('edit', () => {
  test('renaming sends a PATCH with only the changed fields', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Edit' }))
    expect(screen.queryByLabelText('GH_TOKEN')).toBeNull()
    await u.clear(screen.getByLabelText('Name'))
    await u.type(screen.getByLabelText('Name'), 'gh')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchEntry).toHaveBeenCalledWith(entry().id, { name: 'gh' }))
  })
  test('readable values are patched inline by env name', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Edit' }))
    await u.clear(screen.getByLabelText('GH_USER'))
    await u.type(screen.getByLabelText('GH_USER'), 'cat')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchEntry).toHaveBeenCalledWith(entry().id, { envs: { GH_USER: 'cat' } }))
  })
  test('a label change on an attached entry lists the attachments and retries with force after confirmation', async () => {
    api.patchEntry.mockRejectedValueOnce(
      new ApiError(409, 'vault_entry_attached', 'the entry is referenced by presets', {
        attachments: [{ preset_id: 'p1', preset_name: 'reviewer', env: 'GITHUB_TOKEN', entry_env: 'GH_TOKEN' }],
      }),
    )
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Edit' }))
    await u.type(screen.getByLabelText('Labels'), ', project:x')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    const list = within(await screen.findByRole('list', { name: 'Attachments' }))
    expect(list.getByText('reviewer: GITHUB_TOKEN from GH_TOKEN')).toBeTruthy()
    expect(api.patchEntry).toHaveBeenCalledTimes(1)
    expect(api.patchEntry.mock.calls[0]).toHaveLength(2)
    await u.click(screen.getByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(api.patchEntry).toHaveBeenCalledTimes(2))
    expect(api.patchEntry.mock.calls[1][2]).toBe(true)
    expect(api.patchEntry.mock.calls[1][1]).toEqual(api.patchEntry.mock.calls[0][1])
  })
  test('an unavailable orchestrator shows a retry message and Save stays a plain save', async () => {
    api.patchEntry.mockRejectedValueOnce(new ApiError(503, 'orchestrator_unavailable', 'orchestrator down'))
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Edit' }))
    await u.clear(screen.getByLabelText('Name'))
    await u.type(screen.getByLabelText('Name'), 'gh')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed. Try again in a moment.')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchEntry).toHaveBeenCalledTimes(2))
    expect(api.patchEntry.mock.calls[1]).toHaveLength(2)
  })
})

describe('rotate', () => {
  test('requires every protected value, then a confirm step', async () => {
    const e = entry({
      envs: [
        { env: 'A_KEY', protected: true, value: null, updated_at: TS },
        { env: 'B_KEY', protected: true, value: null, updated_at: TS },
      ],
    })
    api.listEntries.mockResolvedValue([e])
    const u = user()
    mount()
    await screen.findByText('github')
    await u.click(card('github').getByRole('button', { name: 'Rotate' }))
    const go = () => screen.getByRole('button', { name: 'Rotate' }) as HTMLButtonElement
    expect(go().disabled).toBe(true)
    await u.type(screen.getByLabelText('A_KEY'), 'one')
    expect(go().disabled).toBe(true)
    await u.type(screen.getByLabelText('B_KEY'), 'two')
    expect(go().disabled).toBe(false)
    await u.click(go())
    expect(api.rotateEntry).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Confirm rotate' }))
    await waitFor(() => expect(api.rotateEntry).toHaveBeenCalledWith(e.id, { A_KEY: 'one', B_KEY: 'two' }))
  })
})

describe('rotate back and secrecy', () => {
  const protectedEntry = entry({ envs: [{ env: 'A_KEY', protected: true, value: null, updated_at: TS }] })
  test('Back from the confirm step keeps the values and cancel sends nothing', async () => {
    api.listEntries.mockResolvedValue([protectedEntry])
    const u = user()
    mount()
    await screen.findByText('github')
    await u.click(card('github').getByRole('button', { name: 'Rotate' }))
    await u.type(screen.getByLabelText('A_KEY'), 'one')
    await u.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(screen.getByText(/as a new version/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Back' }))
    expect((screen.getByLabelText('A_KEY') as HTMLInputElement).value).toBe('one')
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.rotateEntry).not.toHaveBeenCalled()
    await u.click(card('github').getByRole('button', { name: 'Rotate' }))
    expect((screen.getByLabelText('A_KEY') as HTMLInputElement).value).toBe('')
  })
  test('no console output carries a typed value, even when the API fails', async () => {
    api.listEntries.mockResolvedValue([protectedEntry])
    api.rotateEntry.mockRejectedValue(new ApiError(500, 'boom', 'failed'))
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const u = user()
    mount()
    await screen.findByText('github')
    await u.click(card('github').getByRole('button', { name: 'Rotate' }))
    await u.type(screen.getByLabelText('A_KEY'), 'tops3cret')
    await u.click(screen.getByRole('button', { name: 'Rotate' }))
    await u.click(screen.getByRole('button', { name: 'Confirm rotate' }))
    expect((await screen.findByRole('alert')).textContent).toContain('boom: failed')
    expect(screen.getByRole('alert').textContent).not.toContain('tops3cret')
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('tops3cret')
  })
})

describe('delete', () => {
  test('confirms and deletes', async () => {
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('registry').getByRole('button', { name: 'Delete' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteEntry).toHaveBeenCalledWith(other.id))
  })
  test('a 409 shows the attachment list from the response', async () => {
    api.deleteEntry.mockRejectedValue(
      new ApiError(409, 'vault_entry_attached', 'the entry is referenced by presets', {
        attachments: [{ preset_id: 'p1', preset_name: 'reviewer', env: 'GITHUB_TOKEN', entry_env: 'GH_TOKEN' }],
      }),
    )
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Delete' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect((await screen.findByRole('alert')).textContent).toContain('vault_entry_attached')
    const list = within(screen.getByRole('list', { name: 'Attachments' }))
    expect(list.getByText('reviewer: GITHUB_TOKEN from GH_TOKEN')).toBeTruthy()
  })
})

describe('detail', () => {
  test('shows envs, attachments per env, pins and events for the entry', async () => {
    api.getEntry.mockResolvedValue({
      ...entry(),
      versions: [],
      attachments: [{ preset_id: 'p1', preset_name: 'reviewer', env: 'GITHUB_TOKEN', entry_env: 'GH_TOKEN', preset_labels: [], matches: true }],
      mismatched_attachments: [],
    })
    api.listPins.mockResolvedValue([{ session_id: 's-1', env: 'GITHUB_TOKEN', entry_env: 'GH_TOKEN', version: 3, created_at: TS }])
    api.listEvents.mockResolvedValue([{ id: 1, ts: TS, kind: 'entry.rotated', actor: 'alice', entry_id: entry().id, entry_name: 'github', data: {} }])
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Details' }))
    const panel = within(await screen.findByRole('region', { name: 'Entry detail' }))
    await panel.findByText('reviewer as GITHUB_TOKEN')
    expect(panel.getByText('set, v3')).toBeTruthy()
    expect(panel.getByText(/session s-1: GH_TOKEN as GITHUB_TOKEN, v3/)).toBeTruthy()
    expect(panel.getByText(/entry.rotated by alice/)).toBeTruthy()
    expect(api.listEvents).toHaveBeenCalledWith(entry().id)
  })
  test('shows a user actor as user:<email>', async () => {
    api.getEntry.mockResolvedValue({ ...entry(), versions: [], attachments: [], mismatched_attachments: [] })
    api.listEvents.mockResolvedValue([{ id: 2, ts: TS, kind: 'entry.updated', actor: 'user:alice@example.com', entry_id: entry().id, entry_name: 'github', data: {} }])
    const u = user()
    mount()
    await screen.findByText('registry')
    await u.click(card('github').getByRole('button', { name: 'Details' }))
    const panel = within(await screen.findByRole('region', { name: 'Entry detail' }))
    expect(await panel.findByText(/entry.updated by user:alice@example.com/)).toBeTruthy()
  })
})
