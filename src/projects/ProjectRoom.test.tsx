// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { ProjectPost } from './api'
import { ProjectRoom } from './ProjectRoom'

const api = vi.hoisted(() => ({ listProjectMessages: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const post = (id: number, over: Partial<ProjectPost> = {}): ProjectPost => ({
  id, at: '2026-11-11T10:00:00Z', from: `hive-${id}`, sender_kind: 'leader', sender_session_id: `00000000-0000-0000-0000-00000000000${id}`, reply_to: null, text: `text ${id}`, to: [], ...over,
})
const mount = () => render(<MemoryRouter><ThemeProvider theme={theme}><ProjectRoom slug="alpha" onClose={() => {}} /></ThemeProvider></MemoryRouter>)

beforeEach(() => api.listProjectMessages.mockReset())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProjectRoom', () => {
  test('renders posts oldest at top', async () => {
    api.listProjectMessages.mockResolvedValue({ posts: [post(3), post(2), post(1)], next_before_id: null })
    mount()
    await screen.findByText('text 1')
    const texts = screen.getAllByText(/^text \d$/).map((e) => e.textContent)
    expect(texts).toEqual(['text 1', 'text 2', 'text 3'])
    expect(api.listProjectMessages).toHaveBeenCalledWith('alpha', { limit: 50 })
    expect(screen.getByRole('link', { name: 'hive-1' }).getAttribute('href')).toBe('/?session=00000000-0000-0000-0000-000000000001')
  })

  test('older button loads previous page', async () => {
    api.listProjectMessages.mockResolvedValueOnce({ posts: [post(5), post(4)], next_before_id: 4 })
    api.listProjectMessages.mockResolvedValueOnce({ posts: [post(3), post(2)], next_before_id: null })
    const user = userEvent.setup()
    mount()
    await user.click(await screen.findByRole('button', { name: 'Older' }))
    await screen.findByText('text 2')
    expect(api.listProjectMessages).toHaveBeenLastCalledWith('alpha', { beforeId: 4, limit: 50 })
    expect(screen.getAllByText(/^text \d$/).map((e) => e.textContent)).toEqual(['text 2', 'text 3', 'text 4', 'text 5'])
    expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
  })

  test('polls newer posts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.listProjectMessages.mockResolvedValueOnce({ posts: [post(2), post(1)], next_before_id: null })
    api.listProjectMessages.mockResolvedValue({ posts: [post(3)], next_before_id: null })
    mount()
    await screen.findByText('text 2')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await screen.findByText('text 3')
    expect(api.listProjectMessages).toHaveBeenLastCalledWith('alpha', { afterId: 2 })
    expect(screen.getAllByText(/^text \d$/).map((e) => e.textContent)).toEqual(['text 1', 'text 2', 'text 3'])
  })

  test('shows superleader badge and reply quote', async () => {
    api.listProjectMessages.mockResolvedValue({
      posts: [post(2, { sender_kind: 'superleader', reply_to: 1, to: ['hive-1'] }), post(1)], next_before_id: null,
    })
    mount()
    const row = (await screen.findByText('text 2')).closest('li')!
    expect(within(row).getByText('superleader')).toBeTruthy()
    expect(within(row).getByText('reply to p1')).toBeTruthy()
    expect(within(row).getByText('hive-1', { selector: '.MuiChip-label' })).toBeTruthy()
    expect(within(screen.getByText('text 1').closest('li')!).queryByText('superleader')).toBeNull()
  })

  test('empty state', async () => {
    api.listProjectMessages.mockResolvedValue({ posts: [], next_before_id: null })
    mount()
    await waitFor(() => expect(screen.getByText('No posts in this room yet.')).toBeTruthy())
  })
})
