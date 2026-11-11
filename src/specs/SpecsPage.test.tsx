// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mountSpecs, spec } from './testUtils'

const ctx = vi.hoisted(() => ({ project: null as string | null }))
vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ ...ctx, projects: [], setProject: () => {} }) }))
const api = vi.hoisted(() => ({ listSpecs: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
const stream = vi.hoisted(() => ({ opts: null as null | { eventNames?: string[]; onEvent: (d: unknown, i: { type: string; id: string }) => void } }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: NonNullable<typeof stream.opts>) => {
    stream.opts = opts
    return { close: () => {} }
  },
}))

const loc = () => screen.getByTestId('loc').textContent ?? ''
const lastCall = () => api.listSpecs.mock.calls.at(-1)?.[0]

beforeEach(() => {
  api.listSpecs.mockReset()
  api.listSpecs.mockResolvedValue({ items: [spec({ key: 'S-2', name: 'other', title: 'Other spec', status: 'review', labels: ['infra'] }), spec()], next_cursor: null })
})
afterEach(() => {
  cleanup()
  ctx.project = null
})

describe('specs list', () => {
  test('lists every status by default with key, name, title, status and labels', async () => {
    mountSpecs('/specs')
    await screen.findByText('Task plans')
    expect(lastCall()).toMatchObject({ status: undefined })
    const row = screen.getByText('Other spec').closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'S-2' }).getAttribute('href')).toBe('/specs/S-2')
    expect(within(row).getByText('review')).toBeTruthy()
    expect(within(row).getByText('infra')).toBeTruthy()
  })

  test('list is filtered by the selected project', async () => {
    ctx.project = 'infra'
    mountSpecs('/specs')
    await screen.findByText('Task plans')
    expect(lastCall()).toMatchObject({ project: 'infra' })
  })

  test('status, name and label filters write the URL and the query', async () => {
    mountSpecs('/specs')
    await screen.findByText('Task plans')
    await userEvent.click(screen.getByRole('button', { name: 'Approved' }))
    expect(loc()).toBe('/specs?status=approved')
    await waitFor(() => expect(lastCall()).toMatchObject({ status: 'approved' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'plan')
    expect(loc()).toBe('/specs?status=approved&name=plan')
    await waitFor(() => expect(lastCall()).toMatchObject({ name: 'plan' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Labels' }), 'a{Enter}')
    expect(loc()).toBe('/specs?status=approved&name=plan&label=a')
    await waitFor(() => expect(lastCall()).toMatchObject({ labels: ['a'] }))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(loc()).toBe('/specs?name=plan&label=a')
  })

  test('Load more sends the cursor and appends', async () => {
    api.listSpecs.mockResolvedValueOnce({ items: [spec()], next_cursor: 'c1' })
    api.listSpecs.mockResolvedValueOnce({ items: [spec({ key: 'S-9', title: 'Ninth' })], next_cursor: null })
    mountSpecs('/specs')
    await screen.findByText('Task plans')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Ninth')
    expect(lastCall()).toMatchObject({ cursor: 'c1' })
    expect(screen.getByText('Task plans')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a spec_changed event refetches', async () => {
    mountSpecs('/specs')
    await screen.findByText('Task plans')
    expect(stream.opts?.eventNames).toEqual(['spec_changed', 'reset'])
    const before = api.listSpecs.mock.calls.length
    stream.opts?.onEvent({ key: 'S-1', project: 'default' }, { type: 'spec_changed', id: '4' })
    await waitFor(() => expect(api.listSpecs.mock.calls.length).toBeGreaterThan(before))
  })

  test('empty list says so', async () => {
    api.listSpecs.mockResolvedValue({ items: [], next_cursor: null })
    mountSpecs('/specs')
    expect(await screen.findByText('No specs')).toBeTruthy()
  })
})
