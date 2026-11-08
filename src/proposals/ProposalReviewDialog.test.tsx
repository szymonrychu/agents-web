// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { proposal } from './proposalFixture'
import { ProposalReviewDialog } from './ProposalReviewDialog'

const api = vi.hoisted(() => ({ getProposal: vi.fn(), reviewProposal: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('./ValueDiff', () => ({ default: ({ after }: { after: unknown }) => <div data-testid="diff">{JSON.stringify(after)}</div> }))

beforeEach(() => {
  api.getProposal.mockReset()
  api.reviewProposal.mockReset()
})
afterEach(cleanup)

const mount = (p = proposal(), onClose = vi.fn()) => render(<ProposalReviewDialog proposal={p} onClose={onClose} />)
const card = (path: string) => screen.getByText(path).closest('[data-testid="item-card"]') as HTMLElement
const click = (name: string, scope: Pick<typeof screen, 'getByRole'> = screen) => userEvent.click(scope.getByRole('button', { name }))

describe('ProposalReviewDialog', () => {
  it('shows the header facts and the reason as plain text', () => {
    mount(proposal({ revisions: [proposal().revisions[0], { ...proposal().revisions[1], reason: 'see **bold** https://x.io' }] }))
    expect(screen.getByText(/preset/)).toBeTruthy()
    expect(screen.getByText(/worker/)).toBeTruthy()
    expect(screen.getByText(/lead-1/)).toBeTruthy()
    expect(screen.getByText(/superleader/)).toBeTruthy()
    expect(screen.getByText(/r2 of 2/)).toBeTruthy()
    expect(screen.getByText('see **bold** https://x.io')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('orders the cards grant, security, other and marks the changed one', () => {
    mount()
    const paths = screen.getAllByTestId('item-card').map((c) => c.getAttribute('data-path'))
    expect(paths).toEqual(['kube_access', 'env.API_KEY', 'model'])
    expect(within(card('model')).getByText('changed since r1')).toBeTruthy()
    expect(within(card('kube_access')).queryByText(/changed since/)).toBeNull()
  })

  it('submit stays disabled until every item is decided and every rework has a note', async () => {
    mount()
    const submit = screen.getByRole('button', { name: 'Submit review' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await click('Approve', within(card('kube_access')))
    await click('Approve', within(card('env.API_KEY')))
    expect(submit.disabled).toBe(true)
    await click('Rework', within(card('model')))
    expect(submit.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Request rework' })).toBeTruthy()
    expect(screen.getByText(/nothing is applied until the agent revises/)).toBeTruthy()
    await userEvent.type(within(card('model')).getByRole('textbox'), 'use sonnet')
    expect((screen.getByRole('button', { name: 'Request rework' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Approve all decides every item; Submit posts the revision and shows a summary', async () => {
    api.reviewProposal.mockResolvedValue(proposal({ status: 'applied' }))
    mount()
    await click('Approve all')
    await click('Submit review')
    expect(api.reviewProposal).toHaveBeenCalledWith(7, {
      revision: 2,
      items: [
        { path: 'kube_access', decision: 'approve' },
        { path: 'env.API_KEY', decision: 'approve' },
        { path: 'model', decision: 'approve' },
      ],
    })
    expect(await screen.findByText(/Review submitted/)).toBeTruthy()
  })

  it('sends rework and deny notes', async () => {
    api.reviewProposal.mockResolvedValue(proposal())
    mount()
    await click('Approve', within(card('kube_access')))
    await click('Deny', within(card('env.API_KEY')))
    await userEvent.type(within(card('env.API_KEY')).getByRole('textbox'), 'no')
    await click('Rework', within(card('model')))
    await userEvent.type(within(card('model')).getByRole('textbox'), 'again')
    await click('Request rework')
    const body = api.reviewProposal.mock.calls[0][1]
    expect(body.items).toEqual([
      { path: 'kube_access', decision: 'approve' },
      { path: 'env.API_KEY', decision: 'deny', note: 'no' },
      { path: 'model', decision: 'rework', note: 'again' },
    ])
  })

  it('stale: banner, no Approve and no Approve all', () => {
    mount(proposal({ status: 'stale', stale: true }))
    expect(screen.getByText(/stale: the target changed since this revision/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Rework' }).length).toBe(3)
  })

  it('the stale flag alone also stales the dialog', () => {
    mount(proposal({ stale: true }))
    expect(screen.getByText(/stale: the target changed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
  })

  it.each(['proposal_stale', 'revision_changed'])('409 %s refetches and shows the banner', async (code) => {
    api.reviewProposal.mockRejectedValue(new ApiError(409, code, 'nope'))
    api.getProposal.mockResolvedValue(proposal({ status: 'stale', stale: true }))
    mount()
    await click('Approve all')
    await click('Submit review')
    await waitFor(() => expect(api.getProposal).toHaveBeenCalledWith(7))
    expect(await screen.findByText(/stale: the target changed since this revision/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Submit review' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.reviewProposal).toHaveBeenCalledTimes(1)
  })

  it('after a stale refetch Submit needs a stale-mode decision for every item', async () => {
    api.reviewProposal.mockRejectedValue(new ApiError(409, 'proposal_stale', 'nope'))
    api.getProposal.mockResolvedValue(proposal({ status: 'stale', stale: true }))
    mount()
    await click('Approve all')
    await click('Submit review')
    await screen.findByText(/stale: the target changed since this revision/)
    const submit = screen.getByRole('button', { name: 'Submit review' }) as HTMLButtonElement
    await click('Deny', within(card('kube_access')))
    await click('Deny', within(card('env.API_KEY')))
    expect(submit.disabled).toBe(true)
    await click('Deny', within(card('model')))
    expect(submit.disabled).toBe(false)
  })

  it('409 with a new revision resets the choices', async () => {
    api.reviewProposal.mockRejectedValue(new ApiError(409, 'revision_changed', 'nope'))
    api.getProposal.mockResolvedValue(proposal({ revision: 3, revisions: [...proposal().revisions, { ...proposal().revisions[1], revision: 3 }] }))
    mount()
    await click('Approve all')
    await click('Submit review')
    await waitFor(() => expect(screen.getByText(/r3 of 3/)).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Submit review' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryAllByRole('button', { pressed: true }).length).toBe(0)
  })

  it('422 invalid_spec shows the error and keeps the choices', async () => {
    api.reviewProposal.mockRejectedValue(new ApiError(422, 'invalid_spec', 'bad spec'))
    mount()
    await click('Approve all')
    await click('Submit review')
    expect(await screen.findByText(/invalid_spec: bad spec/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Submit review' }) as HTMLButtonElement).disabled).toBe(false)
    expect(within(card('model')).getByRole('button', { name: 'Approve' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('terminal status is read-only: verdicts, no footer actions', () => {
    mount(proposal({ status: 'applied' }))
    expect(screen.queryByRole('button', { name: 'Submit review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('rework is read-only too', () => {
    mount(proposal({ status: 'rework' }))
    expect(screen.queryByRole('button', { name: 'Submit review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
  })

  it('Later closes; earlier revisions sit in a collapsible history', async () => {
    const onClose = vi.fn()
    mount(proposal(), onClose)
    expect(screen.getByRole('button', { name: /earlier revisions/i })).toBeTruthy()
    await click('Later')
    expect(onClose).toHaveBeenCalled()
  })
})
