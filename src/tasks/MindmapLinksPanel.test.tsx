// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { link } from '../mindmap/testUtils'
import { MindmapLinksPanel } from './MindmapLinksPanel'

const api = vi.hoisted(() => ({ listLinks: vi.fn() }))
vi.mock('../mindmap/api', async (orig) => ({ ...(await orig<typeof import('../mindmap/api')>()), ...api }))

const configure = (withMindmap: boolean) =>
  loadConfig((async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, ...(withMindmap ? [{ id: 'mindmap', label: 'M', basePath: '/mindmap/api/v1' }] : [])] }))) as unknown as typeof fetch)
const mount = () => render(<MemoryRouter><MindmapLinksPanel taskKey="T-12" /></MemoryRouter>)

beforeEach(async () => { await configure(true) })
afterEach(() => { cleanup(); resetConfig(); api.listLinks.mockReset() })

describe('MindmapLinksPanel', () => {
  test('lists linked maps and nodes with project, each linking to the mindmaps page', async () => {
    api.listLinks.mockResolvedValue([link({ id: 1, map: 'M-1', node: 'N-2', project: 'alpha' }), link({ id: 2, map: 'M-3', node: null, project: 'beta', relation: 'uses' })])
    mount()
    const node = await screen.findByRole('link', { name: /N-2/ })
    expect(api.listLinks).toHaveBeenCalledWith('T-12')
    expect(node.getAttribute('href')).toBe('/mindmaps/M-1?node=N-2')
    expect(screen.getByText(/alpha/)).toBeTruthy()
    const map = screen.getByRole('link', { name: /M-3/ })
    expect(map.getAttribute('href')).toBe('/mindmaps/M-3')
    expect(screen.getByText(/beta/)).toBeTruthy()
  })

  test('shows an empty state', async () => {
    api.listLinks.mockResolvedValue([])
    mount()
    await screen.findByText('No mind map is linked to this task')
  })

  test('renders nothing and requests nothing without the mindmap backend', async () => {
    resetConfig()
    await configure(false)
    const { container } = mount()
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(api.listLinks).not.toHaveBeenCalled()
  })
})
