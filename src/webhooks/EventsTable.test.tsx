// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import type { EventView } from './api'
import { EventsTable } from './EventsTable'

const ev = (id: number, over: Partial<EventView> = {}): EventView =>
  ({
    id, kind: 'issue', repo: 'acme/app', number: id + 100, title: `Title ${id}`, url: null, status: 'handled', reason: null,
    session_id: null, session_slug: null, endpoint_id: 1, endpoint_suffix: 'gh-main', type: 'github', update_of: null,
    duplicate_of: null, received_at: '2026-10-25T10:00:00Z', chain_status: null, then_schedule_ids: null, ...over,
  }) as EventView

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
