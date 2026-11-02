// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { RecordView, SessionDetail } from './api'
import { HistorySessionView } from './HistorySessionView'

const api = vi.hoisted(() => ({ getSession: vi.fn(), listRecords: vi.fn(), deleteSession: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
// jsdom has no layout, so Virtuoso renders nothing: a stand-in that renders every item, the header and a start-reached trigger.
vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: {
    data: unknown[]
    firstItemIndex: number
    itemContent: (i: number, d: unknown) => ReactNode
    startReached: () => void
    components: { Header: () => ReactNode }
  }) => (
    <div>
      <props.components.Header />
      <button onClick={props.startReached}>reach top</button>
      {props.data.map((d, i) => <div key={props.firstItemIndex + i}>{props.itemContent(props.firstItemIndex + i, d)}</div>)}
    </div>
  ),
}))

const SID = '00000000-0000-4000-8000-000000000042'
const AGENT_ID = '5b0c1f7e-3d2a-4c8b-9a41-0e6f2d7a9c13'

const detail = (over: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 42,
  session_id: SID,
  slug: 'happy-otter',
  preset_id: 'p1',
  preset_name: 'reviewer',
  created_by_service: 'agents-webhook',
  created_by_session: 'boss-1',
  created_at: '2026-10-25T10:00:00Z',
  discarded_at: '2026-10-25T12:00:00Z',
  record_counts: { event: 4, message: 2 },
  bytes: 2048,
  hits: null,
  matches: [],
  session: {},
  agents: [{ id: AGENT_ID, ordinal: 3, pod_name: 'happy-otter-3' }],
  ...over,
})
const eventRecord = (recordId: number, eventId: number, text: string, agent = AGENT_ID): RecordView => ({
  id: recordId,
  kind: 'event',
  ts: '2026-10-25T10:00:00Z',
  truncated: false,
  body: { kind: 'event', id: eventId, agent_id: agent, ts: '2026-10-25T10:00:00Z', type: 'assistant_text', turn_id: 't1', data: { text } },
})
const otherRecord = (id: number, kind: string, body: unknown, truncated = false): RecordView => ({ id, kind, ts: null, truncated, body })
const page = (records: RecordView[], over: { hasMoreBefore?: boolean; next?: number | null } = {}) => ({
  records,
  has_more_before: over.hasMoreBefore ?? false,
  next_after_id: over.next ?? null,
})

const mount = (props: { onBack?: () => void; onDeleted?: () => void } = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <HistorySessionView sessionId={SID} onBack={props.onBack ?? (() => {})} onDeleted={props.onDeleted ?? (() => {})} />
    </ThemeProvider>,
  )

beforeEach(() => {
  api.getSession.mockReset()
  api.listRecords.mockReset()
  api.deleteSession.mockReset()
  api.getSession.mockResolvedValue(detail())
  api.listRecords.mockResolvedValue(page([]))
  api.deleteSession.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('HistorySessionView header', () => {
  test('shows slug, preset, provenance, times and record counts', async () => {
    mount()
    expect(await screen.findByRole('heading', { name: 'happy-otter' })).toBeTruthy()
    expect(api.getSession).toHaveBeenCalledWith(SID)
    expect(screen.getByText(/reviewer/)).toBeTruthy()
    expect(screen.getByText(/agents-webhook/)).toBeTruthy()
    expect(screen.getByText(/boss-1/)).toBeTruthy()
    expect(screen.getByText(new RegExp(new Date('2026-10-25T10:00:00Z').toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
    expect(screen.getByText(new RegExp(new Date('2026-10-25T12:00:00Z').toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
    expect(screen.getByText(/event 4, message 2/)).toBeTruthy()
  })

  test('Back calls onBack', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    mount({ onBack })
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })

  test('shows the server message when the session cannot be loaded', async () => {
    api.getSession.mockRejectedValue(new ApiError(404, 'not_found', 'no such session'))
    mount()
    expect(await screen.findByText(/no such session/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })
})

describe('HistorySessionView chat', () => {
  test('renders stored events as chat items', async () => {
    api.listRecords.mockResolvedValue(page([eventRecord(10, 1, 'the stored answer')]))
    mount()
    expect(await screen.findByText('the stored answer')).toBeTruthy()
    expect(api.listRecords).toHaveBeenCalledWith(SID, { kind: 'event', limit: 200 })
  })

  test('pages older events by record id', async () => {
    api.listRecords
      .mockResolvedValueOnce(page([eventRecord(500, 9, 'newer text')], { hasMoreBefore: true }))
      .mockResolvedValueOnce(page([eventRecord(300, 2, 'older text')]))
    const user = userEvent.setup()
    mount()
    await screen.findByText('newer text')
    await user.click(screen.getByRole('button', { name: 'reach top' }))
    await screen.findByText('older text')
    expect(api.listRecords).toHaveBeenLastCalledWith(SID, { kind: 'event', before_id: 500, limit: 200 })
  })

  test('shows an empty state when the stored events are lifecycle records only', async () => {
    const life = (id: number, type: string, data: unknown): RecordView => ({
      id,
      kind: 'event',
      ts: '2026-10-25T10:00:00Z',
      truncated: false,
      body: { kind: 'event', id, agent_id: AGENT_ID, ts: '2026-10-25T10:00:00Z', type, turn_id: null, data },
    })
    api.listRecords.mockResolvedValue(
      page([life(1, 'bootstrap_step', { step: 'clone', status: 'ok' }), life(2, 'session_state', { state: 'ready' }), life(3, 'session_closed', {})]),
    )
    mount()
    expect(await screen.findByText('No chat messages in this session; see Records.')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Records' })).toBeTruthy()
  })

  test('shows no empty state when there are chat messages', async () => {
    api.listRecords.mockResolvedValue(page([eventRecord(10, 1, 'some answer')]))
    mount()
    await screen.findByText('some answer')
    expect(screen.queryByText(/No chat messages in this session/)).toBeNull()
  })

  test('never opens an EventSource and never calls the orchestrator API', async () => {
    const source = vi.fn()
    const fetchSpy = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('EventSource', source)
    vi.stubGlobal('fetch', fetchSpy)
    api.listRecords.mockResolvedValue(page([eventRecord(10, 1, 'quiet text')]))
    mount()
    await screen.findByText('quiet text')
    vi.unstubAllGlobals()
    expect(source).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('has no composer', async () => {
    api.listRecords.mockResolvedValue(page([eventRecord(10, 1, 'x text')]))
    mount()
    await screen.findByText('x text')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('HistorySessionView records', () => {
  const openRecords = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('tab', { name: 'Records' }))
  }

  test('lists records from the start and filters by kind', async () => {
    api.listRecords.mockImplementation(async (_id: string, q: { kind?: string; after_id?: number }) =>
      q.after_id === 0 ? page([otherRecord(1, q.kind ?? 'message', { text: `kind ${q.kind ?? 'all'}` })]) : page([]),
    )
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await screen.findByText(/kind all/)
    expect(api.listRecords).toHaveBeenLastCalledWith(SID, { after_id: 0, limit: 200 })
    await user.click(screen.getByRole('combobox', { name: 'Kind' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All kinds', 'event (4)', 'message (2)'])
    await user.click(screen.getByRole('option', { name: 'message (2)' }))
    await screen.findByText(/kind message/)
    expect(api.listRecords).toHaveBeenLastCalledWith(SID, { kind: 'message', after_id: 0, limit: 200 })
  })

  test('filters records by text and the regex switch', async () => {
    api.listRecords.mockResolvedValue(page([]))
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await user.type(screen.getByLabelText('Filter text'), 'fa.l')
    await user.click(screen.getByRole('switch', { name: 'Regex' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(api.listRecords).toHaveBeenLastCalledWith(SID, { q: 'fa.l', regex: true, after_id: 0, limit: 200 }))
  })

  test('does not send filter text shorter than 3 and says why', async () => {
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await user.type(screen.getByLabelText('Filter text'), 'ab')
    expect(screen.getByText(/at least 3 characters/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('marks truncated records', async () => {
    api.listRecords.mockImplementation(async (_id: string, q: { after_id?: number }) =>
      q.after_id === 0 ? page([otherRecord(1, 'message', { text: 'cut' }, true), otherRecord(2, 'message', { text: 'whole' })]) : page([]),
    )
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await screen.findByText(/cut/)
    expect(screen.getAllByText('truncated')).toHaveLength(1)
  })

  test('shows JSON bodies collapsed and expands one on demand', async () => {
    api.listRecords.mockImplementation(async (_id: string, q: { after_id?: number }) =>
      q.after_id === 0 ? page([otherRecord(5, 'check', { name: 'lint', detail: { ok: true } })]) : page([]),
    )
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await screen.findByText(/lint/)
    expect(screen.queryByText(/"ok": true/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show record 5' }))
    expect(screen.getByText(/"ok": true/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Hide record 5' }))
    expect(screen.queryByText(/"ok": true/)).toBeNull()
  })

  test('Load more continues after the cursor and ends when none follows', async () => {
    api.listRecords.mockImplementation(async (_id: string, q: { after_id?: number }) => {
      if (q.after_id === 0) return page([otherRecord(1, 'message', { text: 'first page' })], { next: 1 })
      if (q.after_id === 1) return page([otherRecord(2, 'message', { text: 'second page' })])
      return page([])
    })
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    await screen.findByText(/first page/)
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText(/second page/)
    expect(api.listRecords).toHaveBeenLastCalledWith(SID, { after_id: 1, limit: 200 })
    expect(screen.getByText(/first page/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  test('says so when no record matches', async () => {
    const user = userEvent.setup()
    mount()
    await openRecords(user)
    expect(await screen.findByText('No records.')).toBeTruthy()
  })
})

describe('HistorySessionView delete', () => {
  const askDelete = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    return screen.getByRole('dialog')
  }

  test('asks first and deletes nothing on cancel', async () => {
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    mount({ onDeleted })
    const dialog = await askDelete(user)
    expect(within(dialog).getByText('Delete the history of happy-otter?')).toBeTruthy()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.deleteSession).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  test('deletes after confirm, then calls onDeleted', async () => {
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    mount({ onDeleted })
    const dialog = await askDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(api.deleteSession).toHaveBeenCalledWith(SID)
  })

  test('a failed delete shows the message and keeps the session', async () => {
    api.deleteSession.mockRejectedValue(new ApiError(404, 'not_found', 'no such session'))
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    mount({ onDeleted })
    const dialog = await askDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByText(/no such session/)).toBeTruthy()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
