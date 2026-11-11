// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { comment, docBody, docVersion, mountSpecs } from './testUtils'

const api = vi.hoisted(() => ({ getDoc: vi.fn(), listVersions: vi.fn(), listComments: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
vi.mock('../markdown/MermaidBlock', () => ({ MermaidBlock: ({ source }: { source: string }) => <div data-testid="mermaid" data-source={source} /> }))
vi.mock('./VersionDiff', () => ({
  VersionDiff: ({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) => (
    <div data-testid="version-diff" data-before={before} data-after={after}>{`${beforeLabel}-${afterLabel}`}</div>
  ),
}))
const stream = vi.hoisted(() => ({ opts: null as null | { onEvent: (d: unknown, i: { type: string; id: string }) => void } }))
vi.mock('../api/stream', () => ({
  openStream: (_url: string, opts: NonNullable<typeof stream.opts>) => {
    stream.opts = opts
    return { close: () => {} }
  },
}))

const BODY = '# Intro\n\n```mermaid\ngraph TD; A-->B\n```\n'
const V1 = docBody({ version: 1, body: '# Old\n' })
const V2 = docBody({ version: 2, body: BODY })
beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.getDoc.mockImplementation(async (_k: string, _p: string, v?: number) => (v === 1 ? V1 : V2))
  api.listVersions.mockResolvedValue({ items: [docVersion({ version: 2 }), docVersion({ version: 1 })], next_cursor: null })
  api.listComments.mockResolvedValue({ items: [comment({ body: 'a remark' })] })
})
afterEach(cleanup)

describe('document page', () => {
  test('renders through Markdown with heading ids and mermaid, and loads versions and comments for the path', async () => {
    mountSpecs('/specs/S-1/doc/research/topic.md')
    const body = await screen.findByTestId('document-body')
    await waitFor(() => expect(body.querySelector('h1')?.id).toBe('h-intro'))
    expect((await screen.findByTestId('mermaid')).getAttribute('data-source')).toContain('graph TD')
    expect(api.getDoc).toHaveBeenCalledWith('S-1', 'research/topic.md')
    expect(api.listVersions.mock.calls[0].slice(0, 2)).toEqual(['S-1', 'research/topic.md'])
    expect(api.listComments).toHaveBeenCalledWith('S-1', { path: 'research/topic.md' })
    expect(screen.getByText('a remark')).toBeTruthy()
  })

  test('?v loads that version', async () => {
    mountSpecs('/specs/S-1/doc/plan.md?v=1')
    await waitFor(() => expect(screen.getByTestId('document-body').querySelector('h1')?.textContent).toBe('Old'))
    expect(api.getDoc).toHaveBeenCalledWith('S-1', 'plan.md', 1)
    expect(screen.getByText('current is v2')).toBeTruthy()
  })

  test('the version picker writes ?v and the current version clears it', async () => {
    mountSpecs('/specs/S-1/doc/plan.md')
    await screen.findByTestId('document-body')
    await userEvent.selectOptions(screen.getByLabelText('Version'), '1')
    expect(screen.getByTestId('loc').textContent).toBe('/specs/S-1/doc/plan.md?v=1')
    await waitFor(() => expect(screen.getByLabelText('Version')).toHaveProperty('value', '1'))
    await userEvent.selectOptions(screen.getByLabelText('Version'), '2')
    expect(screen.getByTestId('loc').textContent).toBe('/specs/S-1/doc/plan.md')
  })

  test('the diff picker renders VersionDiff between the two bodies', async () => {
    mountSpecs('/specs/S-1/doc/plan.md')
    await screen.findByTestId('document-body')
    await userEvent.selectOptions(screen.getByLabelText('Diff against'), '1')
    expect(screen.getByTestId('loc').textContent).toBe('/specs/S-1/doc/plan.md?diff=1')
    const d = await screen.findByTestId('version-diff')
    expect(d.getAttribute('data-before')).toBe('# Old\n')
    expect(d.getAttribute('data-after')).toBe(BODY)
    expect(d.textContent).toBe('v1-v2')
  })

  test('a deleted event shows the deleted message', async () => {
    mountSpecs('/specs/S-1/doc/plan.md')
    await screen.findByTestId('document-body')
    stream.opts?.onEvent({ key: 'S-1', deleted: true }, { type: 'spec_changed', id: '4' })
    expect(await screen.findByText('This spec was deleted')).toBeTruthy()
  })

  test('a missing document says so', async () => {
    api.getDoc.mockRejectedValue(new ApiError(404, 'not_found', 'no'))
    mountSpecs('/specs/S-1/doc/gone.md')
    expect(await screen.findByText('gone.md not found in S-1')).toBeTruthy()
  })

  test('a change event for this spec refetches', async () => {
    mountSpecs('/specs/S-1/doc/plan.md')
    await screen.findByTestId('document-body')
    const before = api.getDoc.mock.calls.length
    stream.opts?.onEvent({ key: 'S-1', path: 'plan.md', version: 3 }, { type: 'spec_changed', id: '5' })
    await waitFor(() => expect(api.getDoc.mock.calls.length).toBeGreaterThan(before))
  })
})
