// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import type { EventView } from './api'
import { EventsTable } from './EventsTable'
import { setViewport } from '../test/viewport'

const ev = (id: number, over: Partial<EventView> = {}): EventView =>
  ({
    id, kind: 'issue', repo: 'acme/app', number: id + 100, title: `Title ${id}`, url: null, status: 'handled', reason: null,
    session_id: null, session_slug: null, endpoint_id: 1, endpoint_suffix: 'gh-main', type: 'github', update_of: null,
    duplicate_of: null, received_at: '2026-10-25T10:00:00Z', chain_status: null, then_schedule_ids: null, ...over,
  }) as EventView

beforeEach(() => setViewport(1440))
afterEach(cleanup)

describe('chain column', () => {
  test('shows the chain status of events that chain and nothing for the rest', () => {
    render(<ThemeProvider theme={theme}><EventsTable events={[ev(1, { chain_status: 'fired' }), ev(2), ev(3, { chain_status: 'pending' })]} /></ThemeProvider>)
    expect(screen.getByRole('columnheader', { name: 'Chain' })).toBeTruthy()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByLabelText('chain fired')).toBeTruthy()
    expect(within(rows[1]).queryByLabelText(/^chain /)).toBeNull()
    expect(within(rows[2]).getByLabelText('chain pending')).toBeTruthy()
  })
})

describe('events on phones', () => {
  beforeEach(() => setViewport(375, { coarse: true }))

  test('one card per event with its meta fields and the scroll target id', () => {
    render(<ThemeProvider theme={theme}><EventsTable events={[ev(1), ev(2, { chain_status: 'fired', session_slug: 'agent-x' })]} /></ThemeProvider>)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    const card = screen.getByRole('article', { name: 'Event 2' })
    expect(card.id).toBe('event-2')
    const c = within(card)
    expect(c.getByText('Title 2')).toBeTruthy()
    for (const f of ['Received', 'Kind', 'Item', 'Status', 'Chain', 'Session']) expect(c.getByText(f, { selector: 'dt' })).toBeTruthy()
    expect(c.queryByText('Endpoint', { selector: 'dt' })).toBeNull()
    expect(c.getByText('agent-x')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'Event 1' })).getByText('Chain', { selector: 'dt' }).nextElementSibling?.textContent).toBe('-')
  })
})

describe('events on wide screens', () => {
  test('is a table with every column and rows carry the scroll target id', () => {
    render(<ThemeProvider theme={theme}><EventsTable events={[ev(1)]} /></ThemeProvider>)
    const table = screen.getByRole('table', { name: 'Events' })
    for (const h of ['Received', 'Endpoint', 'Kind', 'Item', 'Title', 'Status', 'Chain', 'Session']) expect(within(table).getByRole('columnheader', { name: h })).toBeTruthy()
    expect(within(table).getByText('gh-main (github)').closest('tr')!.id).toBe('event-1')
  })
})
