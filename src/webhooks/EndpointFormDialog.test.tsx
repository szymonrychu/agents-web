// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { EndpointCreated, EndpointView } from './api'
import { EndpointFormDialog } from './EndpointFormDialog'

const api = vi.hoisted(() => ({
  createEndpoint: vi.fn(),
  patchEndpoint: vi.fn(),
  cloneEndpoint: vi.fn(),
  previewTemplate: vi.fn(),
  getMeta: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const META = { filter_fields: { 'github-pr': ['author'], 'gitlab-mr': ['author'], 'grafana-alert': ['labels'] } }
const view = (over: Partial<EndpointView> = {}): EndpointView =>
  ({
    id: 7, suffix: 'abc', url: 'https://h.example/webhook/abc', type: 'gitlab-mr', preset_id: 'p1', prompt_template: 'Hi {{ repo }}',
    username: null, created_at: '2026-10-25T10:00:00Z', credentials_rotated_at: null, filters: { allow: [], deny: [] },
    auth_mode: 'header', auth_header: 'X-Gitlab-Token', hmac_algorithm: null, hmac_prefix: null, hmac_timestamp_header: null,
    has_secret: true, updated_at: '2026-10-25T10:00:00Z', ...over,
  }) as EndpointView
const created = (over: Partial<EndpointCreated> = {}): EndpointCreated => ({ ...view(), password: null, secret: null, ...over }) as EndpointCreated

const wrap = (ui: React.ReactElement) => <ThemeProvider theme={theme}>{ui}</ThemeProvider>
const rangeOriginal = { rects: Range.prototype.getClientRects, box: Range.prototype.getBoundingClientRect }
beforeAll(() => {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterAll(() => {
  Range.prototype.getClientRects = rangeOriginal.rects
  Range.prototype.getBoundingClientRect = rangeOriginal.box
})
beforeEach(() => {
  Object.values(api).forEach((m) => { m.mockReset() })
  client.listPresets.mockReset()
  api.getMeta.mockResolvedValue(META)
  client.listPresets.mockResolvedValue([
    { id: 'p1', name: 'Default preset', is_default: true },
    { id: 'p2', name: 'Other preset', is_default: false },
  ])
})
afterEach(cleanup)

type User = ReturnType<typeof userEvent.setup>
const choose = async (u: User, combo: string, option: string | RegExp) => {
  await u.click(await screen.findByRole('combobox', { name: combo }))
  await u.click(await screen.findByRole('option', { name: option }))
}
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value
const mode = () => screen.getByRole('combobox', { name: 'Auth mode' }).textContent
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const mount = (props: Partial<React.ComponentProps<typeof EndpointFormDialog>> = {}) => {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(wrap(<EndpointFormDialog open mode="create" onClose={onClose} onDone={onDone} {...props} />))
  return { onDone, onClose }
}

describe('auth presets in the create form', () => {
  test('GitLab pre-fills header mode and the X-Gitlab-Token header', async () => {
    const u = userEvent.setup()
    mount()
    await choose(u, 'Auth preset', /^GitLab/)
    expect(mode()).toBe('Header token')
    expect(value('Header name')).toBe('X-Gitlab-Token')
    expect(screen.queryByLabelText('HMAC prefix')).toBeNull()
    expect(screen.queryByLabelText('Timestamp header')).toBeNull()
  })

  test('GitHub pre-fills hmac with the sha256= prefix; the hmac-only fields appear only for hmac', async () => {
    const u = userEvent.setup()
    mount()
    await choose(u, 'Auth preset', /^GitHub/)
    expect(mode()).toBe('HMAC signature (sha256)')
    expect(value('Header name')).toBe('X-Hub-Signature-256')
    expect(value('HMAC prefix')).toBe('sha256=')
    expect(screen.getByLabelText('Timestamp header')).toBeTruthy()
    await choose(u, 'Auth preset', /^Grafana \(bearer/)
    expect(mode()).toBe('Bearer token')
    expect(screen.queryByLabelText('Header name')).toBeNull()
    expect(screen.queryByLabelText('HMAC prefix')).toBeNull()
  })

  test('Grafana HMAC pre-fills its signature header with no prefix', async () => {
    const u = userEvent.setup()
    mount()
    await choose(u, 'Auth preset', /^Grafana \(HMAC/)
    expect(value('Header name')).toBe('X-Grafana-Alerting-Signature')
    expect(value('HMAC prefix')).toBe('')
  })

  test('every pre-filled field stays editable and is what is sent', async () => {
    api.createEndpoint.mockResolvedValue(created({ secret: 'x' }))
    const u = userEvent.setup()
    const { onDone } = mount()
    await choose(u, 'Preset', /Default preset/)
    await choose(u, 'Auth preset', /^GitHub/)
    await u.clear(screen.getByLabelText('Header name'))
    await u.type(screen.getByLabelText('Header name'), 'X-Mine')
    await u.clear(screen.getByLabelText('HMAC prefix'))
    await u.type(screen.getByLabelText('Timestamp header'), 'X-Ts')
    await u.click(button('Create'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.createEndpoint).toHaveBeenCalledWith({
      type: 'github-pr', preset_id: 'p1', auth_mode: 'hmac', auth_header: 'X-Mine', hmac_algorithm: 'sha256', hmac_prefix: '', hmac_timestamp_header: 'X-Ts',
    })
  })

  test('a header or hmac endpoint needs a header name', async () => {
    const u = userEvent.setup()
    mount()
    await choose(u, 'Preset', /Default preset/)
    await choose(u, 'Auth preset', /^GitLab/)
    await u.clear(screen.getByLabelText('Header name'))
    expect(button('Create').disabled).toBe(true)
  })

  test('the credentials switch is only for basic mode', async () => {
    const u = userEvent.setup()
    mount()
    expect(screen.getByLabelText('Set credentials')).toBeTruthy()
    await choose(u, 'Auth preset', /^GitLab/)
    expect(screen.queryByLabelText('Set credentials')).toBeNull()
  })
})

describe('edit', () => {
  test('edits every field except the secret, shows the secret as set, and never offers a secret input', async () => {
    api.patchEndpoint.mockResolvedValue(created())
    const u = userEvent.setup()
    const { onDone } = mount({ mode: 'edit', endpoint: view() })
    expect(await screen.findByText(/secret: set, never shown/i)).toBeTruthy()
    expect(screen.queryByLabelText(/^(Secret|Password)$/)).toBeNull()
    expect((screen.getByRole('combobox', { name: 'Type' }) as HTMLElement).getAttribute('aria-disabled')).toBe('true')
    expect(value('Suffix')).toBe('abc')
    expect(value('Header name')).toBe('X-Gitlab-Token')
    expect(button('Save').disabled).toBe(true)
    await choose(u, 'Preset', /Other preset/)
    await u.clear(screen.getByLabelText('Suffix'))
    await u.type(screen.getByLabelText('Suffix'), 'renamed')
    expect(screen.getByText(/sender URL changes/i)).toBeTruthy()
    await u.click(button('Save'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.patchEndpoint).toHaveBeenCalledWith('7', { preset_id: 'p2', suffix: 'renamed' })
  })

  test('changing the auth mode warns that a new secret is issued and sends the whole auth group', async () => {
    api.patchEndpoint.mockResolvedValue(created({ auth_mode: 'hmac', secret: 'shown-once' }))
    const u = userEvent.setup()
    const { onDone } = mount({ mode: 'edit', endpoint: view() })
    await choose(u, 'Preset', /Default preset/)
    expect(screen.queryByText(/new secret is issued/i)).toBeNull()
    await choose(u, 'Auth preset', /^GitHub/)
    expect(screen.getByText(/new secret is issued/i)).toBeTruthy()
    await u.click(button('Save'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.patchEndpoint).toHaveBeenCalledWith('7', {
      auth_mode: 'hmac', auth_header: 'X-Hub-Signature-256', hmac_algorithm: 'sha256', hmac_prefix: 'sha256=', hmac_timestamp_header: null,
    })
    expect(onDone.mock.calls[0][0].secret).toBe('shown-once')
  })

  test('basic edit offers the username but no password', async () => {
    const basic = view({ auth_mode: 'basic', auth_header: null, username: 'bob', type: 'github-pr' })
    mount({ mode: 'edit', endpoint: basic })
    expect(await screen.findByDisplayValue('bob')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  test('Rotate is its own action', async () => {
    const onRotate = vi.fn()
    const u = userEvent.setup()
    mount({ mode: 'edit', endpoint: view(), onRotate })
    await u.click(button('Rotate secret'))
    expect(onRotate).toHaveBeenCalled()
    expect(api.patchEndpoint).not.toHaveBeenCalled()
  })

  test('a patch error is shown in the dialog', async () => {
    const { ApiError } = await import('../api/client')
    api.patchEndpoint.mockRejectedValue(new ApiError(409, 'suffix_taken', 'suffix already used'))
    const u = userEvent.setup()
    const { onDone } = mount({ mode: 'edit', endpoint: view() })
    await u.clear(screen.getByLabelText('Suffix'))
    await u.type(screen.getByLabelText('Suffix'), 'dup')
    await u.click(button('Save'))
    expect(await screen.findByText(/suffix_taken: suffix already used/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('clone', () => {
  test('clone offers preset and suffix overrides, calls clone, and hands over the new secret', async () => {
    api.cloneEndpoint.mockResolvedValue(created({ id: 8, secret: 'fresh-once' }))
    const u = userEvent.setup()
    const { onDone } = mount({ mode: 'clone', endpoint: view() })
    expect(screen.queryByLabelText('Auth mode')).toBeNull()
    expect(screen.getByText(/new secret is issued/i)).toBeTruthy()
    await u.type(screen.getByLabelText('Suffix'), 'copy-1')
    await u.click(button('Clone'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.cloneEndpoint).toHaveBeenCalledWith('7', { suffix: 'copy-1' })
    expect(onDone.mock.calls[0][0].secret).toBe('fresh-once')
  })

  test('clone with no overrides sends none', async () => {
    api.cloneEndpoint.mockResolvedValue(created({ id: 8, secret: 'fresh-once' }))
    const u = userEvent.setup()
    mount({ mode: 'clone', endpoint: view() })
    await u.click(button('Clone'))
    await waitFor(() => expect(api.cloneEndpoint).toHaveBeenCalledWith('7', {}))
  })
})
