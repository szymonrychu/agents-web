// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { item, proposal } from './proposalFixture'
import { ProposalsPage } from './ProposalsPage'

const api = vi.hoisted(() => ({ listProposals: vi.fn(), getProposal: vi.fn(), reviewProposal: vi.fn() }))
vi.mock('./api', () => api)

const NOW = Date.parse('2026-11-08T12:00:00Z')
const mount = (onBack = () => {}) => render(<ThemeProvider theme={theme}><ProposalsPage onBack={onBack} /></ThemeProvider>)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.values(api).forEach((m) => m.mockReset())
  api.listProposals.mockImplementation(async (status: string) =>
    status === 'active'
      ? [proposal({ id: 7, target_name: 'worker' })]
      : [proposal({ id: 8, kind: 'schedule', target_name: 'nightly', proposer_slug: 'lead-2', proposer_superleader: false, status: 'applied', revision: 1, revisions: [proposal().revisions[0]] })],
  )
  // the dialog fetches the full view of the row it opens
  api.getProposal.mockImplementation(async (id: number) => [...(await api.listProposals('active')), ...(await api.listProposals('closed'))].find((p: { id: number }) => p.id === id))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProposalsPage', () => {
  test('active tab lists kind, target, proposer, status, revision and age', async () => {
    mount()
    const row = (await screen.findByText('worker')).closest('tr') as HTMLElement
    const r = within(row)
    expect(r.getByText('preset')).toBeTruthy()
    expect(r.getByText('lead-1')).toBeTruthy()
    expect(r.getByText('open')).toBeTruthy()
    expect(r.getByText('r2')).toBeTruthy()
    expect(r.getByText('2h')).toBeTruthy()
    expect(api.listProposals).toHaveBeenCalledWith('active')
  })

  test('closed tab lists terminal proposals', async () => {
    mount()
    await screen.findByText('worker')
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('tab', { name: 'Closed' }))
    expect(await screen.findByText('nightly')).toBeTruthy()
    expect(screen.getByText('applied')).toBeTruthy()
    expect(api.listProposals).toHaveBeenCalledWith('closed')
  })

  test('a row opens the review dialog with a submit button when open', async () => {
    mount()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByText('worker'))
    expect(await screen.findByRole('button', { name: /submit review|request rework/i })).toBeTruthy()
  })

  test('a terminal proposal opens read-only', async () => {
    mount()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await screen.findByText('worker')
    await user.click(screen.getByRole('tab', { name: 'Closed' }))
    await user.click(await screen.findByText('nightly'))
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: /submit review|request rework/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
  })

  test('shows an empty line and an error', async () => {
    api.listProposals.mockResolvedValue([])
    mount()
    expect(await screen.findByText('No active proposals')).toBeTruthy()
    cleanup()
    api.listProposals.mockRejectedValue(new Error('boom'))
    mount()
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy())
  })

  test('secret values are never rendered', async () => {
    api.listProposals.mockResolvedValue([proposal({ revisions: [proposal().revisions[0], { ...proposal().revisions[1], items: [item({ path: 'env.K', before: null, after: { name: 'K' }, security: true })] }] })])
    const { container } = mount()
    await screen.findByText('worker')
    expect(container.textContent).not.toMatch(/hunter2/)
  })
})
