// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { EndpointCreated, EndpointView } from './api'
import { CreateEndpointDialog } from './CreateEndpointDialog'
import { CredentialsDialog } from './CredentialsDialog'
import { EndpointsList } from './EndpointsList'

const api = vi.hoisted(() => ({
  createEndpoint: vi.fn(),
  rotateEndpoint: vi.fn(),
  deleteEndpoint: vi.fn(),
  listEndpoints: vi.fn(),
  previewTemplate: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const PASSWORD = 'pw-secret-0123456789'
const view = (over: Partial<EndpointView> = {}): EndpointView =>
  ({
    id: 1, suffix: 'abc', url: 'https://h.example/webhook/abc', type: 'github-pr', preset_id: 'p1', prompt_template: null,
    username: 'user1', created_at: '2026-10-25T10:00:00Z', credentials_rotated_at: null, ...over,
  }) as EndpointView
const created = (over: Partial<EndpointCreated> = {}): EndpointCreated => ({ ...view(), password: PASSWORD, ...over }) as EndpointCreated

const wrap = (ui: React.ReactElement) => <ThemeProvider theme={theme}>{ui}</ThemeProvider>
const apiError = (status: number, code: string, message: string) => new ApiError(status, code, message)

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  client.listPresets.mockReset()
  client.listPresets.mockResolvedValue([
    { id: 'p1', name: 'Default preset', is_default: true },
    { id: 'p2', name: 'Other preset', is_default: false },
  ])
  api.listEndpoints.mockResolvedValue([view(), view({ id: 2, suffix: 'g2', url: 'https://h.example/webhook/g2', type: 'grafana-alert', preset_id: 'p2', username: 'user2', credentials_rotated_at: '2026-10-26T10:00:00Z' })])
})
afterEach(cleanup)

const pickPreset = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
  await u.click(await screen.findByRole('combobox', { name: 'Preset' }))
  await u.click(await screen.findByRole('option', { name: new RegExp(name) }))
}
const mountCreate = () => {
  const onCreated = vi.fn()
  const onClose = vi.fn()
  render(wrap(<CreateEndpointDialog open onClose={onClose} onCreated={onCreated} />))
  return { onCreated, onClose }
}

describe('create', () => {
  test('create with defaults sends type and preset and reports the created endpoint', async () => {
    api.createEndpoint.mockResolvedValue(created())
    const u = userEvent.setup()
    const { onCreated } = mountCreate()
    await pickPreset(u, 'Default preset')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(api.createEndpoint).toHaveBeenCalledWith({ type: 'github-pr', preset_id: 'p1' })
    expect(onCreated.mock.calls[0][0].password).toBe(PASSWORD)
  })

  test('create with suffix, credentials and template sends them', async () => {
    api.createEndpoint.mockResolvedValue(created())
    const u = userEvent.setup()
    mountCreate()
    await u.click(screen.getByRole('combobox', { name: 'Type' }))
    await u.click(await screen.findByRole('option', { name: 'GitLab MR' }))
    await pickPreset(u, 'Other preset')
    await u.type(screen.getByLabelText('Suffix'), 'my.hook_1')
    await u.click(screen.getByLabelText('Set credentials'))
    await u.type(screen.getByLabelText('Username'), 'bob')
    await u.type(screen.getByLabelText('Password'), 'a-long-enough-password')
    await u.click(screen.getByLabelText('Prompt template'))
    await u.paste('Review {{ repo }}')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createEndpoint).toHaveBeenCalled())
    expect(api.createEndpoint).toHaveBeenCalledWith({
      type: 'gitlab-mr', preset_id: 'p2', suffix: 'my.hook_1', username: 'bob', password: 'a-long-enough-password', prompt_template: 'Review {{ repo }}',
    })
  })

  test('create requires a preset', async () => {
    const u = userEvent.setup()
    mountCreate()
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    await pickPreset(u, 'Default preset')
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('create rejects a short password and a bad suffix client-side', async () => {
    const u = userEvent.setup()
    mountCreate()
    await pickPreset(u, 'Default preset')
    await u.type(screen.getByLabelText('Suffix'), 'bad suffix!')
    expect(screen.getByText(/letters, digits/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    await u.clear(screen.getByLabelText('Suffix'))
    await u.click(screen.getByLabelText('Set credentials'))
    await u.type(screen.getByLabelText('Username'), 'bob')
    await u.type(screen.getByLabelText('Password'), 'short')
    expect(screen.getByText(/At least 16/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('create shows the template preview with the example JSON and the rendered prompt', async () => {
    api.previewTemplate.mockResolvedValue({ prompt: 'Review acme/app' })
    const u = userEvent.setup()
    mountCreate()
    await u.click(screen.getByLabelText('Prompt template'))
    await u.paste('Review {{ repo }}')
    const example = screen.getByLabelText('Example JSON') as HTMLTextAreaElement
    expect(JSON.parse(example.value)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText('Review acme/app')
    expect(api.previewTemplate).toHaveBeenCalledWith({ template: 'Review {{ repo }}', type: 'github-pr', example: JSON.parse(example.value) })
  })

  test('create preview shows the render error and rejects invalid example JSON', async () => {
    api.previewTemplate.mockRejectedValue(apiError(422, 'invalid_request', 'line 1: undefined name'))
    const u = userEvent.setup()
    mountCreate()
    await u.click(screen.getByLabelText('Prompt template'))
    await u.paste('{{ nope }}')
    await u.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText(/line 1: undefined name/)).toBeTruthy()
    const example = screen.getByLabelText('Example JSON')
    await u.clear(example)
    await u.click(example)
    await u.paste('{oops')
    api.previewTemplate.mockClear()
    await u.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText(/Example JSON is not valid JSON/)).toBeTruthy()
    expect(api.previewTemplate).not.toHaveBeenCalled()
  })
})

describe('error', () => {
  test('error 409 suffix_taken is shown in the dialog', async () => {
    api.createEndpoint.mockRejectedValue(apiError(409, 'suffix_taken', 'suffix already used'))
    const u = userEvent.setup()
    const { onCreated } = mountCreate()
    await pickPreset(u, 'Default preset')
    await u.type(screen.getByLabelText('Suffix'), 'dup')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText(/suffix_taken: suffix already used/)).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
  })

  test('error 422 is shown in the dialog', async () => {
    api.createEndpoint.mockRejectedValue(apiError(422, 'invalid_request', 'template line 2: bad tag'))
    const u = userEvent.setup()
    mountCreate()
    await pickPreset(u, 'Default preset')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText(/template line 2: bad tag/)).toBeTruthy()
  })
})

describe('credentials dialog', () => {
  test('create shows the full URL, username and password once with the type hint', async () => {
    const onClose = vi.fn()
    const { rerender } = render(wrap(<CredentialsDialog endpoint={created()} onClose={onClose} />))
    expect(screen.getByText(PASSWORD)).toBeTruthy()
    expect(screen.getByText('user1')).toBeTruthy()
    expect(screen.getByText('https://h.example/webhook/abc')).toBeTruthy()
    expect(screen.getByText('The password is shown only now. Rotate the credentials to get a new one.')).toBeTruthy()
    expect(screen.getByText(/https:\/\/<user>:<password>@<host>\/webhook\/<suffix>/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Copy/ })).toHaveLength(3)
    rerender(wrap(<CredentialsDialog endpoint={created({ type: 'grafana-alert' })} onClose={onClose} />))
    expect(screen.getByText(/basic auth/i)).toBeTruthy()
    rerender(wrap(<CredentialsDialog endpoint={null} onClose={onClose} />))
    expect(screen.queryByText(PASSWORD)).toBeNull()
  })

  test('create copy buttons write to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const u = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(wrap(<CredentialsDialog endpoint={created()} onClose={() => {}} />))
    await u.click(screen.getByRole('button', { name: 'Copy password' }))
    expect(writeText).toHaveBeenCalledWith(PASSWORD)
  })
})

describe('list', () => {
  test('list renders URL, type, preset name, username and copy buttons, never the password', async () => {
    render(wrap(<EndpointsList refreshKey={0} onChanged={() => {}} />))
    const row = (await screen.findByText('https://h.example/webhook/abc')).closest('tr')!
    expect(within(row).getByText('github-pr')).toBeTruthy()
    expect(within(row).getByText('Default preset')).toBeTruthy()
    expect(within(row).getByText('user1')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Copy URL' })).toBeTruthy()
    expect(screen.getByText('Other preset')).toBeTruthy()
    expect(document.body.textContent).not.toContain(PASSWORD)
  })

  test('list empty state offers a create button', async () => {
    api.listEndpoints.mockResolvedValue([])
    const onCreate = vi.fn()
    render(wrap(<EndpointsList refreshKey={0} onChanged={() => {}} onCreate={onCreate} />))
    expect(await screen.findByText('No endpoints yet')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'New endpoint' }))
    expect(onCreate).toHaveBeenCalled()
  })

  test('list reloads when refreshKey changes', async () => {
    const { rerender } = render(wrap(<EndpointsList refreshKey={0} onChanged={() => {}} />))
    await screen.findByText('https://h.example/webhook/abc')
    rerender(wrap(<EndpointsList refreshKey={1} onChanged={() => {}} />))
    await waitFor(() => expect(api.listEndpoints).toHaveBeenCalledTimes(2))
  })
})

describe('rotate and delete', () => {
  test('rotate asks, calls the API, shows the new credentials and drops the password on close', async () => {
    api.rotateEndpoint.mockResolvedValue(created({ password: 'new-password-0123456789' }))
    const onChanged = vi.fn()
    const u = userEvent.setup()
    render(wrap(<EndpointsList refreshKey={0} onChanged={onChanged} />))
    const row = (await screen.findByText('https://h.example/webhook/abc')).closest('tr')!
    await u.click(within(row).getByRole('button', { name: 'Rotate credentials' }))
    expect(api.rotateEndpoint).not.toHaveBeenCalled()
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rotate' }))
    expect(await screen.findByText('new-password-0123456789')).toBeTruthy()
    expect(api.rotateEndpoint).toHaveBeenCalledWith('1')
    expect(onChanged).toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByText('new-password-0123456789')).toBeNull())
    expect(document.body.textContent).not.toContain('new-password-0123456789')
  })

  test('rotate cancel does not call the API', async () => {
    const u = userEvent.setup()
    render(wrap(<EndpointsList refreshKey={0} onChanged={() => {}} />))
    const row = (await screen.findByText('https://h.example/webhook/abc')).closest('tr')!
    await u.click(within(row).getByRole('button', { name: 'Rotate credentials' }))
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.rotateEndpoint).not.toHaveBeenCalled()
  })

  test('delete asks naming the URL, then calls the API and refreshes', async () => {
    api.deleteEndpoint.mockResolvedValue(undefined)
    const onChanged = vi.fn()
    const u = userEvent.setup()
    render(wrap(<EndpointsList refreshKey={0} onChanged={onChanged} />))
    const row = (await screen.findByText('https://h.example/webhook/abc')).closest('tr')!
    await u.click(within(row).getByRole('button', { name: 'Delete' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByText(/https:\/\/h\.example\/webhook\/abc/)).toBeTruthy()
    expect(api.deleteEndpoint).not.toHaveBeenCalled()
    await u.click(within(dlg).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteEndpoint).toHaveBeenCalledWith('1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})
