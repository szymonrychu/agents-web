// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { EndpointView, EventView } from './api'
import { WebhooksPage } from './WebhooksPage'

const api = vi.hoisted(() => ({ listEvents: vi.fn(), listEndpoints: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const ev = (id: number, over: Partial<EventView> = {}): EventView =>
  ({
    id, kind: 'issue', repo: 'acme/app', number: id + 100, title: `Title ${id}`, url: `https://gh/acme/app/issues/${id + 100}`,
    status: 'new', reason: null, cluster_slug: null, endpoint_id: 1, endpoint_suffix: 'gh-main', type: 'github',
    update_of: null, duplicate_of: null, received_at: '2026-10-25T10:00:00Z', ...over,
  }) as EventView
const endpoint = (id: number, suffix: string): EndpointView => ({ id, suffix, type: 'github' }) as EndpointView

const mount = () => render(<ThemeProvider theme={theme}><WebhooksPage onBack={() => {}} /></ThemeProvider>)
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  api.listEvents.mockReset()
  api.listEndpoints.mockReset()
  api.listEndpoints.mockResolvedValue([endpoint(1, 'gh-main'), endpoint(2, 'gl')])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WebhooksPage rows', () => {
  test('rows show endpoint, kind, repo, title, status chip with reason and cluster', async () => {
    api.listEvents.mockResolvedValue([
      ev(3, { status: 'handled', cluster_slug: 'agent-x', reason: 'ok done' }),
      ev(2, { status: 'ignored', reason: 'not mine', update_of: 7 }),
      ev(1, { duplicate_of: 5 }),
    ])
    mount()
    await flush()
    expect(screen.getByRole('heading', { name: 'Webhooks' })).toBeTruthy()
    const row = screen.getByText('Title 3').closest('tr')!
    expect(within(row).getByText(/gh-main/)).toBeTruthy()
    expect(within(row).getByText('issue')).toBeTruthy()
    expect(within(row).getByRole('link', { name: 'acme/app#103' }).getAttribute('href')).toBe('https://gh/acme/app/issues/103')
    expect(within(row).getByLabelText('handled: ok done')).toBeTruthy()
    expect(within(row).getByText('agent-x')).toBeTruthy()
    expect(screen.getByLabelText('ignored: not mine')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'update of #7' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'duplicate of #5' })).toBeTruthy()
  })
})

describe('WebhooksPage filter', () => {
  test('status and endpoint filters change the query', async () => {
    api.listEvents.mockResolvedValue([ev(1)])
    mount()
    await flush()
    expect(api.listEvents).toHaveBeenLastCalledWith({ status: undefined, endpointId: undefined, limit: 50 })
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(screen.getByRole('option', { name: 'failed' }))
    await flush()
    expect(api.listEvents).toHaveBeenLastCalledWith({ status: 'failed', endpointId: undefined, limit: 50 })
    await userEvent.click(screen.getByRole('combobox', { name: 'Endpoint' }))
    await userEvent.click(screen.getByRole('option', { name: 'gl' }))
    await flush()
    expect(api.listEvents).toHaveBeenLastCalledWith({ status: 'failed', endpointId: '2', limit: 50 })
  })

  test('polling refreshes every 5 seconds', async () => {
    api.listEvents.mockResolvedValueOnce([ev(1)]).mockResolvedValue([ev(2, { title: 'Fresh' })])
    mount()
    await flush()
    expect(screen.getByText('Title 1')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText('Fresh')).toBeTruthy()
  })

  test('load older appends the next page with beforeId', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ev(100 - i))
    api.listEvents.mockImplementation(async (o: { beforeId?: string }) => (o.beforeId ? [ev(10, { title: 'Older' })] : page))
    mount()
    await flush()
    await userEvent.click(screen.getByRole('button', { name: 'Load older' }))
    await flush()
    expect(api.listEvents).toHaveBeenCalledWith({ status: undefined, endpointId: undefined, limit: 50, beforeId: '51' })
    expect(screen.getByText('Older')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull()
  })
})

describe('WebhooksPage state', () => {
  test('empty state points at the endpoints section', async () => {
    api.listEvents.mockResolvedValue([])
    mount()
    await flush()
    expect(screen.getByText(/No events yet/)).toBeTruthy()
    expect(screen.getByText(/endpoints section/)).toBeTruthy()
  })

  test('error state shows the failure', async () => {
    api.listEvents.mockRejectedValue(new Error('boom'))
    mount()
    await flush()
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
