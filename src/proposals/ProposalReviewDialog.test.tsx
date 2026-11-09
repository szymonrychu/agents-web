// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { item, proposal } from './proposalFixture'
import { ProposalReviewDialog } from './ProposalReviewDialog'

const api = vi.hoisted(() => ({ getProposal: vi.fn(), reviewProposal: vi.fn() }))
const vault = vi.hoisted(() => ({ listEntries: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('../vault/api', async (orig) => ({ ...(await orig<typeof import('../vault/api')>()), vaultEnabled: () => true, listEntries: vault.listEntries }))
vi.mock('./ValueDiff', () => ({ default: ({ after }: { after: unknown }) => <div data-testid="diff">{JSON.stringify(after)}</div> }))

beforeEach(() => {
  api.getProposal.mockReset()
  api.reviewProposal.mockReset()
  vault.listEntries.mockReset()
  vault.listEntries.mockResolvedValue([])
})
afterEach(cleanup)

// the dialog fetches the full view (all revisions) on mount; by default the server returns the same view
const mount = (p = proposal(), onClose = vi.fn()) => {
  api.getProposal.mockResolvedValueOnce(p)
  return render(<ProposalReviewDialog proposal={p} onClose={onClose} />)
}
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

  it('fetches the full view: a list view with only the current revision gains history and changed chips', async () => {
    const listView = proposal({ revisions: [proposal().revisions[1]] })
    api.getProposal.mockResolvedValueOnce(proposal())
    render(<ProposalReviewDialog proposal={listView} onClose={vi.fn()} />)
    expect(api.getProposal).toHaveBeenCalledWith(7)
    expect(screen.getByText(/r2 of 2/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /earlier revisions/i })).toBeTruthy()
    expect(within(card('model')).getByText('changed since r1')).toBeTruthy()
  })

  it('choices made before the full view arrives are kept', async () => {
    let resolve: (p: ReturnType<typeof proposal>) => void = () => {}
    api.getProposal.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    render(<ProposalReviewDialog proposal={proposal({ revisions: [proposal().revisions[1]] })} onClose={vi.fn()} />)
    await click('Approve', within(card('model')))
    resolve(proposal())
    expect(await screen.findByRole('button', { name: /earlier revisions/i })).toBeTruthy()
    expect(within(card('model')).getByRole('button', { name: 'Approve' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('Later closes; earlier revisions sit in a collapsible history', async () => {
    const onClose = vi.fn()
    mount(proposal(), onClose)
    expect(screen.getByRole('button', { name: /earlier revisions/i })).toBeTruthy()
    await click('Later')
    expect(onClose).toHaveBeenCalled()
  })

  it('a schedule proposal is titled with the schedule name and links to the Schedules page', async () => {
    const onOpenSchedule = vi.fn()
    api.getProposal.mockResolvedValue(proposal({ kind: 'schedule', target_name: 'nightly' }))
    render(<ProposalReviewDialog proposal={proposal({ kind: 'schedule', target_name: 'nightly' })} onClose={vi.fn()} onOpenSchedule={onOpenSchedule} />)
    expect(screen.getByText('schedule nightly')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Open schedules' }))
    expect(onOpenSchedule).toHaveBeenCalledTimes(1)
  })

  it('a preset proposal has no schedules link', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Open schedules' })).toBeNull()
  })

  it('a session proposal from a regular leader is titled, marked, links to the session and lists the grant first', async () => {
    const onOpenSession = vi.fn()
    const p = proposal({
      kind: 'session',
      target_id: 'sess-1',
      target_name: 'worker-1',
      proposer_superleader: false,
      revisions: [
        {
          ...proposal().revisions[1],
          items: [item({ path: 'model', after: 'haiku' }), item({ path: 'session_messaging', before: false, after: true, grant: true, security: true })],
        },
      ],
      revision: 2,
    })
    api.getProposal.mockResolvedValue(p)
    render(<ProposalReviewDialog proposal={p} onClose={vi.fn()} onOpenSession={onOpenSession} />)
    expect(screen.getByText('session worker-1')).toBeTruthy()
    expect(screen.getByText('leader of its own session')).toBeTruthy()
    expect(screen.queryByText(/\(superleader\)/)).toBeNull()
    expect(screen.getAllByTestId('item-card').map((c) => c.getAttribute('data-path'))).toEqual(['session_messaging', 'model'])
    expect(within(card('session_messaging')).getByText('grant')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Open session' }))
    expect(onOpenSession).toHaveBeenCalledWith('sess-1')
  })

  it('a superleader proposal has no leader marker and a preset has no session link', () => {
    mount()
    expect(screen.queryByText('leader of its own session')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open session' })).toBeNull()
  })

  it('test_entries_loaded_once', async () => {
    mount()
    expect(screen.getAllByTestId('item-card').length).toBe(3)
    await waitFor(() => expect(vault.listEntries).toHaveBeenCalledTimes(1))
  })
})
