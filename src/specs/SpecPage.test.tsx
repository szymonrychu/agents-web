// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { task } from '../tasks/testUtils'
import { docVersion, mountSpecs, spec } from './testUtils'

const api = vi.hoisted(() => ({ getSpec: vi.fn(), patchSpec: vi.fn(), createComment: vi.fn(), getTask: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
vi.mock('../tasks/api', async (orig) => ({ ...(await orig<typeof import('../tasks/api')>()), getTask: api.getTask }))
const stream = vi.hoisted(() => ({ opts: null as null | { onEvent: (d: unknown, i: { type: string; id: string }) => void } }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: NonNullable<typeof stream.opts>) => {
    stream.opts = opts
    return { close: () => {} }
  },
}))

const full = (over = {}) =>
  spec({ status: 'review', labels: ['plans'], documents: [docVersion(), docVersion({ path: 'research/topic.md', version: 1, size: 9 })], tasks: ['T-4'], open_comments: 2, ...over })

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getSpec.mockResolvedValue(full())
  api.getTask.mockResolvedValue(task({ key: 'T-4', title: 'Gate task', open_decisions: 1 }))
  api.patchSpec.mockResolvedValue(full({ status: 'approved' }))
  api.createComment.mockResolvedValue({})
})
afterEach(cleanup)

describe('spec page', () => {
  test('bundle shows title, status, documents with versions, linked tasks with open decisions and the open comment count', async () => {
    mountSpecs('/specs/S-1')
    await screen.findByText('Task plans')
    expect(screen.getByText('review')).toBeTruthy()
    expect(screen.getByText('2 open comments')).toBeTruthy()
    const doc = screen.getByRole('link', { name: 'research/topic.md' })
    expect(doc.getAttribute('href')).toBe('/specs/S-1/doc/research/topic.md')
    expect(screen.getByText('v1')).toBeTruthy()
    expect(await screen.findByText('Gate task')).toBeTruthy()
    expect(screen.getByText('Blocked (1)')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'T-4' }).getAttribute('href')).toBe('/tasks/T-4')
  })

  test('Approve patches the status with the spec version', async () => {
    mountSpecs('/specs/S-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(api.patchSpec).toHaveBeenCalledWith('S-1', { version: 2, status: 'approved' })
  })

  test('Archive patches archived', async () => {
    mountSpecs('/specs/S-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    expect(api.patchSpec).toHaveBeenCalledWith('S-1', { version: 2, status: 'archived' })
  })

  test('Request changes posts a comment then sets draft', async () => {
    mountSpecs('/specs/S-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'What should change' }), 'split it')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.patchSpec).toHaveBeenCalledWith('S-1', { version: 2, status: 'draft' }))
    expect(api.createComment).toHaveBeenCalledWith('S-1', { body: 'split it' })
    expect(api.createComment.mock.invocationCallOrder[0]).toBeLessThan(api.patchSpec.mock.invocationCallOrder[0])
  })

  test('retrying Request changes after a failed PATCH does not post the comment twice', async () => {
    api.patchSpec.mockRejectedValueOnce(new Error('boom'))
    mountSpecs('/specs/S-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Request changes' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'What should change' }), 'split it')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/boom/)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.patchSpec).toHaveBeenCalledTimes(2))
    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  test('a PATCH 412 reloads with a notice', async () => {
    api.patchSpec.mockRejectedValue(new ApiError(412, 'stale_version', 'changed', { current_version: 3 }))
    mountSpecs('/specs/S-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/changed since you opened it/)).toBeTruthy()
    expect(api.getSpec.mock.calls.length).toBeGreaterThan(1)
  })

  test('spec_changed for this key refetches, for another key does not, reset refetches', async () => {
    mountSpecs('/specs/S-1')
    await screen.findByText('Task plans')
    const n = () => api.getSpec.mock.calls.length
    const before = n()
    stream.opts?.onEvent({ key: 'S-9' }, { type: 'spec_changed', id: '1' })
    await new Promise((r) => setTimeout(r, 20))
    expect(n()).toBe(before)
    stream.opts?.onEvent({ key: 'S-1' }, { type: 'spec_changed', id: '2' })
    await waitFor(() => expect(n()).toBeGreaterThan(before))
    const mid = n()
    stream.opts?.onEvent({}, { type: 'reset', id: '3' })
    await waitFor(() => expect(n()).toBeGreaterThan(mid))
  })

  test('a deleted event shows the deleted message', async () => {
    mountSpecs('/specs/S-1')
    await screen.findByText('Task plans')
    stream.opts?.onEvent({ key: 'S-1', deleted: true }, { type: 'spec_changed', id: '4' })
    expect(await screen.findByText('This spec was deleted')).toBeTruthy()
  })

  test('404 shows not found', async () => {
    api.getSpec.mockRejectedValue(new ApiError(404, 'not_found', 'gone'))
    mountSpecs('/specs/S-1')
    expect(await screen.findByText('Spec S-1 not found')).toBeTruthy()
  })
})
