// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { SessionSummary } from './api'
import { HistoryPage } from './HistoryPage'

const api = vi.hoisted(() => ({ listSessions: vi.fn(), getSession: vi.fn(), listRecords: vi.fn(), deleteSession: vi.fn(), getRetention: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const row = (id: number, over: Partial<SessionSummary> = {}): SessionSummary => ({
  id,
  session_id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  slug: `slug-${id}`,
  preset_id: null,
  preset_name: `preset-${id}`,
  created_by_service: null,
  created_by_session: null,
  created_at: '2026-10-25T10:00:00Z',
  discarded_at: '2026-10-25T12:00:00Z',
  record_counts: { assistant: 3, user: 2 },
  bytes: 2048,
  hits: null,
  matches: [],
  ...over,
})
const detailOf = (r: SessionSummary) => ({ ...r, session: {}, agents: [] })
const pageOf = (from: number, count: number) => Array.from({ length: count }, (_, i) => row(from - i))

const mount = (onBack = () => {}) => render(<ThemeProvider theme={theme}><HistoryPage onBack={onBack} /></ThemeProvider>)
const search = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Search' }))

beforeEach(() => {
  api.listSessions.mockReset()
  api.listSessions.mockResolvedValue([])
  api.getSession.mockReset()
  api.listRecords.mockReset()
  api.listRecords.mockResolvedValue({ records: [], has_more_before: false, next_after_id: null })
  api.deleteSession.mockReset()
  api.deleteSession.mockResolvedValue(undefined)
  api.getRetention.mockReset()
  api.getRetention.mockResolvedValue({ retention_days: 90, updated_at: '2026-10-20T08:00:00Z', last_sweep_at: null, last_sweep_deleted: null })
})
afterEach(cleanup)

describe('HistoryPage search', () => {
  test('searches with the typed text and the regex switch', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'fail(ed)')
    await user.click(screen.getByRole('switch', { name: 'Regex' }))
    await search(user)
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1))
    expect(api.listSessions).toHaveBeenCalledWith({ q: 'fail(ed)', regex: true, limit: 50 })
  })

  test('does not send q shorter than 3 and says why', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'ab')
    expect(screen.getByText(/at least 3 characters/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true)
    await user.keyboard('{Enter}')
    expect(api.listSessions).not.toHaveBeenCalled()
  })

  test('submits with Enter and lists without q when the field is empty', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByLabelText('Search'))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledWith({ limit: 50 }))
  })

  test('sends date, preset and session filters', async () => {
    const user = userEvent.setup()
    mount()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-25' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } })
    await user.type(screen.getByLabelText('Preset'), 'reviewer')
    await user.type(screen.getByLabelText('Session'), 'my-slug')
    await search(user)
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1))
    expect(api.listSessions).toHaveBeenCalledWith({
      from: new Date('2026-10-25T00:00:00').toISOString(),
      to: new Date('2026-11-01T23:59:59.999').toISOString(),
      preset: 'reviewer',
      session: 'my-slug',
      limit: 50,
    })
  })
})

describe('HistoryPage retention', () => {
  test('shows the retention card above the search', async () => {
    mount()
    const card = await screen.findByText('Keep 90 days')
    const search = screen.getByLabelText('Search')
    expect(card.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('HistoryPage results', () => {
  test('shows the columns of a session row', async () => {
    api.listSessions.mockResolvedValue([row(7, { bytes: 3 * 1024 * 1024, record_counts: { assistant: 3, user: 2 } })])
    const user = userEvent.setup()
    mount()
    await search(user)
    const r = (await screen.findByText('slug-7')).closest('tr')!
    expect(within(r).getByText('preset-7')).toBeTruthy()
    expect(within(r).getByText(new Date('2026-10-25T10:00:00Z').toLocaleString())).toBeTruthy()
    expect(within(r).getByText(new Date('2026-10-25T12:00:00Z').toLocaleString())).toBeTruthy()
    expect(within(r).getByText('assistant 3, user 2')).toBeTruthy()
    expect(within(r).getByText('3.0 MB')).toBeTruthy()
  })

  test('says so when nothing matches', async () => {
    const user = userEvent.setup()
    mount()
    await search(user)
    expect(await screen.findByText('No sessions match.')).toBeTruthy()
  })

  test('shows hits and snippets, at most 3 per row', async () => {
    const m = (n: number) => ({ record_id: n, kind: 'assistant', ts: null, snippet: `snippet text ${n}` })
    api.listSessions.mockResolvedValue([row(1, { hits: 5, matches: [m(1), m(2), m(3), m(4)] }), row(2, { hits: 1, matches: [m(9)] })])
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'snippet')
    await search(user)
    expect(await screen.findByText('5 hits')).toBeTruthy()
    expect(screen.getByText('1 hit')).toBeTruthy()
    for (const n of [1, 2, 3, 9]) expect(screen.getByText(`snippet text ${n}`)).toBeTruthy()
    expect(screen.queryByText('snippet text 4')).toBeNull()
  })

  test('loads more with before_id of the last row and appends', async () => {
    api.listSessions.mockResolvedValueOnce(pageOf(100, 50)).mockResolvedValueOnce(pageOf(50, 3))
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'needle')
    await search(user)
    await screen.findByText('slug-100')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('slug-50')
    expect(api.listSessions).toHaveBeenLastCalledWith({ q: 'needle', limit: 50, before_id: 51 })
    expect(screen.getByText('slug-100')).toBeTruthy()
  })

  test('a short page is the end: no Load more', async () => {
    api.listSessions.mockResolvedValueOnce(pageOf(10, 2))
    const user = userEvent.setup()
    mount()
    await search(user)
    await screen.findByText('slug-10')
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a full page keeps Load more and a short page after it ends paging', async () => {
    api.listSessions.mockResolvedValueOnce(pageOf(100, 50)).mockResolvedValueOnce(pageOf(50, 7))
    const user = userEvent.setup()
    mount()
    await search(user)
    await screen.findByText('slug-100')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('slug-50')
    expect(api.listSessions).toHaveBeenLastCalledWith({ limit: 50, before_id: 51 })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('a full page followed by an empty one ends paging', async () => {
    api.listSessions.mockResolvedValueOnce(pageOf(100, 50)).mockResolvedValueOnce([])
    const user = userEvent.setup()
    mount()
    await search(user)
    await screen.findByText('slug-100')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull())
    expect(api.listSessions).toHaveBeenLastCalledWith({ limit: 50, before_id: 51 })
  })

  test('a new search uses the new filters and drops the old rows', async () => {
    api.listSessions.mockResolvedValueOnce([row(5)]).mockResolvedValueOnce([row(6)])
    const user = userEvent.setup()
    mount()
    await search(user)
    await screen.findByText('slug-5')
    await user.type(screen.getByLabelText('Session'), 'x')
    await search(user)
    await screen.findByText('slug-6')
    expect(screen.queryByText('slug-5')).toBeNull()
    expect(api.listSessions).toHaveBeenLastCalledWith({ session: 'x', limit: 50 })
  })

  test('shows the server error message', async () => {
    api.listSessions.mockRejectedValue(new ApiError(422, 'invalid_regex', 'the pattern is not a valid regular expression'))
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'fa(il')
    await user.click(screen.getByRole('switch', { name: 'Regex' }))
    await search(user)
    expect(await screen.findByText(/the pattern is not a valid regular expression/)).toBeTruthy()
  })

  test('opens a session on row click', async () => {
    api.listSessions.mockResolvedValue([row(4)])
    api.getSession.mockResolvedValue(detailOf(row(4)))
    const user = userEvent.setup()
    mount()
    await search(user)
    await user.click(await screen.findByText('slug-4'))
    expect(await screen.findByRole('heading', { name: 'slug-4' })).toBeTruthy()
    expect(api.getSession).toHaveBeenCalledWith(row(4).session_id)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy()
    expect(screen.getByText('slug-4')).toBeTruthy()
  })

  test('deleting the open session returns to the list and refetches the same query', async () => {
    api.listSessions.mockResolvedValueOnce([row(4), row(3)]).mockResolvedValueOnce([row(3)])
    api.getSession.mockResolvedValue(detailOf(row(4)))
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Search'), 'needle')
    await search(user)
    await user.click(await screen.findByText('slug-4'))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('slug-4')).toBeNull())
    expect(screen.getByText('slug-3')).toBeTruthy()
    expect(api.deleteSession).toHaveBeenCalledWith(row(4).session_id)
    expect(api.listSessions).toHaveBeenCalledTimes(2)
    expect(api.listSessions).toHaveBeenLastCalledWith({ q: 'needle', limit: 50 })
  })

  test('Back leaves the page', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    mount(onBack)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })
})
