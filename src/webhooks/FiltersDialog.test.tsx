// @vitest-environment jsdom
import { useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { EndpointView, Filters } from './api'
import { EndpointsList } from './EndpointsList'
import { sampleFor } from './samples'

const api = vi.hoisted(() => ({
  listEndpoints: vi.fn(),
  getMeta: vi.fn(),
  setEndpointFilters: vi.fn(),
  previewTemplate: vi.fn(),
  rotateEndpoint: vi.fn(),
  deleteEndpoint: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const META = {
  filter_fields: {
    'github-pr': ['author', 'labels', 'source_branch'],
    'grafana-alert': ['labels', 'title', 'body'],
  },
}
const STORED: Filters = {
  allow: [{ field: 'labels', match: 'equals', values: ['ready'] }],
  deny: [{ field: 'author', match: 'regex', values: ['^bot-'] }],
}
const URL1 = 'https://h.example/webhook/abc'
const view = (over: Partial<EndpointView> = {}): EndpointView => ({
  id: 1, suffix: 'abc', url: URL1, type: 'github-pr', preset_id: 'p1', prompt_template: null,
  username: 'user1', created_at: '2026-10-25T10:00:00Z', credentials_rotated_at: null, filters: STORED,
  auth_mode: 'basic', auth_header: null, hmac_algorithm: null, hmac_prefix: null, hmac_timestamp_header: null, has_secret: false,
  updated_at: '2026-10-25T10:00:00Z', ...over,
})
const GRAFANA = view({ id: 2, suffix: 'g2', url: 'https://h.example/webhook/g2', type: 'grafana-alert', filters: { allow: [], deny: [] } })

/** The page's wiring: onChanged bumps refreshKey, which reloads the list. */
function Harness({ onChanged }: { onChanged?: () => void }) {
  const [key, setKey] = useState(0)
  return (
    <ThemeProvider theme={theme}>
      <EndpointsList refreshKey={key} onChanged={() => { onChanged?.(); setKey((k) => k + 1) }} />
    </ThemeProvider>
  )
}

const row = async (url = URL1) => (await screen.findByText(url)).closest('tr')!
const openFilters = async (u: ReturnType<typeof userEvent.setup>, name = 'Filters (2)') => {
  const button = await within(await row()).findByRole('button', { name })
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  await u.click(button)
  return screen.findByRole('dialog')
}
const section = (dialog: HTMLElement, side: RegExp) => within(dialog).getByRole('region', { name: side })
const valuesOf = (region: HTMLElement) => within(region).getAllByLabelText('Values').map((el) => (el as HTMLTextAreaElement).value)

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  client.listPresets.mockReset()
  client.listPresets.mockResolvedValue([{ id: 'p1', name: 'Default preset', is_default: true }])
  api.getMeta.mockResolvedValue(META)
  api.listEndpoints.mockResolvedValue([view(), GRAFANA])
})
afterEach(cleanup)

describe('filters dialog', () => {
  test('opens prefilled from the list', async () => {
    const u = userEvent.setup()
    render(<Harness />)
    expect(within(await row()).getByRole('button', { name: 'Filters (2)' })).toBeTruthy()
    expect(within(await row(GRAFANA.url)).getByRole('button', { name: 'Filters (0)' })).toBeTruthy()
    const dialog = await openFilters(u)
    const allow = section(dialog, /^Allow/)
    const deny = section(dialog, /^Deny/)
    expect(within(allow).getByRole('combobox', { name: 'Field' }).textContent).toBe('labels')
    expect(valuesOf(allow)).toEqual(['ready'])
    expect(within(deny).getByRole('combobox', { name: 'Field' }).textContent).toBe('author')
    expect(within(deny).getByRole('combobox', { name: 'Match' }).textContent).toBe('regex')
    expect(valuesOf(deny)).toEqual(['^bot-'])
    const example = within(dialog).getByLabelText('Example JSON') as HTMLTextAreaElement
    expect(JSON.parse(example.value)).toEqual(JSON.parse(sampleFor('github-pr')))
  })

  test('saves and refreshes', async () => {
    const saved = view({ filters: { allow: [], deny: STORED.deny } })
    api.setEndpointFilters.mockResolvedValue(saved)
    const onChanged = vi.fn()
    const u = userEvent.setup()
    render(<Harness onChanged={onChanged} />)
    const dialog = await openFilters(u)
    await u.click(within(section(dialog, /^Allow/)).getByRole('button', { name: 'Remove rule' }))
    api.listEndpoints.mockResolvedValue([saved, GRAFANA])
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.setEndpointFilters).toHaveBeenCalledWith('1', { allow: [], deny: STORED.deny })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(await within(await row()).findByRole('button', { name: 'Filters (1)' })).toBeTruthy()
    expect(api.listEndpoints).toHaveBeenCalledTimes(2)
  })

  test('shows the backend error', async () => {
    api.setEndpointFilters.mockRejectedValue(new ApiError(422, 'invalid_request', 'deny rule 0: invalid regex'))
    const onChanged = vi.fn()
    const u = userEvent.setup()
    render(<Harness onChanged={onChanged} />)
    const dialog = await openFilters(u)
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(/invalid_request: deny rule 0: invalid regex/)).toBeTruthy()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(onChanged).not.toHaveBeenCalled()
    expect((within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('checks the example', async () => {
    api.previewTemplate.mockResolvedValue({ prompt: null, filters: { passed: false, reason: 'filter_denied: author' } })
    const u = userEvent.setup()
    render(<Harness />)
    const dialog = await openFilters(u)
    await u.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByText('Ignored: filter_denied: author')).toBeTruthy()
    expect(api.previewTemplate).toHaveBeenCalledWith({ type: 'github-pr', example: JSON.parse(sampleFor('github-pr')), filters: STORED })
    expect(api.setEndpointFilters).not.toHaveBeenCalled()

    api.previewTemplate.mockResolvedValue({ prompt: null, filters: { passed: true, reason: null } })
    await u.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByText('Passes the filters')).toBeTruthy()

    const example = within(dialog).getByLabelText('Example JSON')
    await u.clear(example)
    await u.click(example)
    await u.paste('{oops')
    api.previewTemplate.mockClear()
    await u.click(within(dialog).getByRole('button', { name: 'Check' }))
    expect(await within(dialog).findByText(/Example JSON is not valid JSON/)).toBeTruthy()
    expect(api.previewTemplate).not.toHaveBeenCalled()
  })

  test('cancel sends nothing', async () => {
    const onChanged = vi.fn()
    const u = userEvent.setup()
    render(<Harness onChanged={onChanged} />)
    let dialog = await openFilters(u)
    await u.click(within(section(dialog, /^Deny/)).getByRole('button', { name: 'Remove rule' }))
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.setEndpointFilters).not.toHaveBeenCalled()
    expect(api.previewTemplate).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    dialog = await openFilters(u)
    expect(valuesOf(section(dialog, /^Deny/))).toEqual(['^bot-'])
  })

  test('keeps the stored rules through a slow meta load and sends them back unchanged', async () => {
    let resolve!: (m: typeof META) => void
    api.getMeta.mockReturnValue(new Promise((r) => { resolve = r }))
    api.setEndpointFilters.mockResolvedValue(view())
    const u = userEvent.setup()
    render(<Harness />)
    const button = within(await row()).getByRole('button', { name: 'Filters (2)' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    resolve(META)
    const dialog = await openFilters(u)
    expect(valuesOf(section(dialog, /^Allow/))).toEqual(['ready'])
    expect(valuesOf(section(dialog, /^Deny/))).toEqual(['^bot-'])
    await u.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.setEndpointFilters).toHaveBeenCalledWith('1', STORED))
  })

  test('a failed meta load shows its error and keeps the editor unmounted', async () => {
    api.getMeta.mockRejectedValue(new ApiError(503, 'unavailable', 'meta down'))
    render(<Harness />)
    expect(await screen.findByText(/unavailable: meta down/)).toBeTruthy()
    expect((within(await row()).getByRole('button', { name: 'Filters (2)' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
