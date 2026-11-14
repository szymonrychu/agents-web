// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, test } from 'vitest'
import type { SpecStart } from './StartState'
import { StartState } from './StartState'

const start = (over: Partial<SpecStart> = {}): SpecStart => ({
  id: 1, ordinal: 1, status: 'new', mode: null, project: 'alpha', position: null, hold_reason: null, slug: null, session_id: null, error: null,
  created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z', ...over,
})
const mount = (starts: SpecStart[]) => render(<MemoryRouter><StartState starts={starts} /></MemoryRouter>)
afterEach(cleanup)

describe('StartState', () => {
  test('renders nothing without starts', () => {
    const { container } = mount([])
    expect(container.textContent).toBe('')
  })

  test('nudged links to the owner session', () => {
    mount([start({ status: 'handled', mode: 'nudged', session_id: 's-9' })])
    const link = screen.getByRole('link', { name: 'Messaged owner session' })
    expect(link.getAttribute('href')).toBe('/?session=s-9')
  })

  test('started links to the new session', () => {
    mount([start({ status: 'handled', mode: 'started', slug: 'impl-1', session_id: 's-3' })])
    const link = screen.getByRole('link', { name: 'Started session impl-1' })
    expect(link.getAttribute('href')).toBe('/?session=s-3')
  })

  test('queued shows position, project and the hold reason text', () => {
    mount([start({ status: 'queued', position: 2, hold_reason: 'at_limit' })])
    expect(screen.getByText('Queued #2 in alpha - at session limit')).toBeTruthy()
  })

  test('queued without a known reason says waiting, autostart_off maps to the off text', () => {
    const { unmount } = mount([start({ status: 'queued', position: 1, hold_reason: null })])
    expect(screen.getByText('Queued #1 in alpha - waiting')).toBeTruthy()
    unmount()
    mount([start({ status: 'queued', position: 1, hold_reason: 'autostart_off' })])
    expect(screen.getByText('Queued #1 in alpha - autostart off - set limits')).toBeTruthy()
  })

  test('in progress', () => {
    mount([start({ status: 'in_progress', slug: 'impl-2' })])
    expect(screen.getByText('Starting session impl-2')).toBeTruthy()
  })

  test('failed shows the error', () => {
    mount([start({ status: 'failed', error: 'no preset' })])
    expect(screen.getByText('Start failed: no preset')).toBeTruthy()
  })

  test('removed', () => {
    mount([start({ status: 'removed' })])
    expect(screen.getByText('Removed from queue')).toBeTruthy()
  })

  test('shows the latest start by ordinal', () => {
    mount([start({ id: 2, ordinal: 2, status: 'removed' }), start({ id: 1, ordinal: 1, status: 'failed', error: 'x' })])
    expect(screen.getByText('Removed from queue')).toBeTruthy()
    expect(screen.queryByText(/Start failed/)).toBeNull()
  })
})
