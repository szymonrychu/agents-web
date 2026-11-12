// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { SearchBox } from './SearchBox'
import { hit } from './testUtils'

const api = vi.hoisted(() => ({ searchNodes: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const onOpen = vi.fn()
const mount = (project: string | null = 'default') =>
  render(<ThemeProvider theme={theme}><SearchBox project={project} onOpen={onOpen} /></ThemeProvider>)
const search = async (u: ReturnType<typeof userEvent.setup>, text = 'graphs') => {
  await u.type(screen.getByRole('searchbox', { name: 'Search nodes' }), `${text}{Enter}`)
}

beforeEach(() => {
  api.searchNodes.mockReset()
  onOpen.mockReset()
  api.searchNodes.mockResolvedValue({ items: [hit()], semantic: true, pending_embedding: 0 })
})
afterEach(cleanup)

describe('SearchBox', () => {
  test('defaults to own scope and hybrid mode', async () => {
    const u = userEvent.setup()
    mount()
    await search(u)
    await waitFor(() => expect(api.searchNodes).toHaveBeenCalledWith({ q: 'graphs', project: 'default', scope: 'own', mode: 'hybrid' }))
  })

  test('selected project scope sends the project', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'All projects' }))
    await u.click(screen.getByRole('button', { name: 'Selected project' }))
    await search(u)
    await waitFor(() => expect(api.searchNodes).toHaveBeenCalledWith({ q: 'graphs', project: 'default', scope: 'own', mode: 'hybrid' }))
    expect(api.searchNodes.mock.calls.at(-1)?.[0]).toHaveProperty('project', 'default')
  })

  test('scope all and mode lexical are sent', async () => {
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'All projects' }))
    await u.click(screen.getByRole('button', { name: 'lexical' }))
    await search(u)
    await waitFor(() => expect(api.searchNodes).toHaveBeenCalledWith({ q: 'graphs', scope: 'all', mode: 'lexical' }))
    expect(api.searchNodes.mock.calls.at(-1)?.[0]).not.toHaveProperty('project')
  })

  test('a snippet with markup renders as literal text', async () => {
    api.searchNodes.mockResolvedValue({ items: [hit({ snippet: 'before <b>x</b> after' })], semantic: true, pending_embedding: 0 })
    const u = userEvent.setup()
    mount()
    await search(u)
    const li = (await screen.findByText(/before/)) as HTMLElement
    expect(li.textContent).toBe('before <b>x</b> after')
    expect(document.querySelector('b')).toBeNull()
  })

  test('semantic false shows the lexical only hint', async () => {
    api.searchNodes.mockResolvedValue({ items: [hit()], semantic: false, pending_embedding: 0 })
    const u = userEvent.setup()
    mount()
    expect(screen.queryByText(/lexical only/)).toBeNull()
    await search(u)
    expect(await screen.findByText(/lexical only/)).toBeTruthy()
  })

  test('lexical mode never shows the lexical only hint', async () => {
    api.searchNodes.mockResolvedValue({ items: [hit()], semantic: false, pending_embedding: 0 })
    const u = userEvent.setup()
    mount()
    await u.click(screen.getByRole('button', { name: 'lexical' }))
    await search(u)
    await screen.findByRole('button', { name: /Child A/ })
    expect(screen.queryByText(/lexical only/)).toBeNull()
  })

  test('picking a hit opens it', async () => {
    const u = userEvent.setup()
    mount()
    await search(u)
    await u.click(await screen.findByRole('button', { name: /Child A/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: 'N-2', map: 'M-1' }))
  })

  test('an empty query does not search', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByRole('searchbox', { name: 'Search nodes' }), '  {Enter}')
    expect(api.searchNodes).not.toHaveBeenCalled()
  })
})
