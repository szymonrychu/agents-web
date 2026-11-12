// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { theme } from '../theme'
import { MindmapsRoute } from './routes'
import { mapView, subgraph } from './testUtils'
import type { NodeStub } from './api'

const api = vi.hoisted(() => ({ listProjects: vi.fn(), listMaps: vi.fn(), getMap: vi.fn(), getGraph: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('./useMindmapStream', () => ({ useMindmapStream: () => {} }))
vi.mock('./GraphView', () => ({
  GraphView: (p: { graph: { nodes: NodeStub[] }; onSelect: (n: NodeStub) => void }) => (
    <div>{p.graph.nodes.map((n) => <button key={n.key} onClick={() => p.onSelect(n)}>{`graph ${n.key}`}</button>)}</div>
  ),
}))
vi.mock('./NodePanel', () => ({ NodePanel: (p: { nodeKey: string }) => <div data-testid="node-panel">{p.nodeKey}</div> }))

function Loc() {
  const l = useLocation()
  return <div data-testid="loc">{`${l.pathname}${l.search}`}</div>
}
const mount = (path: string) =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mindmaps/*" element={<MindmapsRoute />} />
          <Route path="*" element={<div />} />
        </Routes>
        <Loc />
      </MemoryRouter>
    </ThemeProvider>,
  )
const configure = (...extra: string[]) =>
  loadConfig((async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, ...extra.map((id) => ({ id, label: id, basePath: `/${id}/api/v1` }))] }))) as unknown as typeof fetch)

beforeEach(async () => {
  await configure('mindmap')
  api.listProjects.mockResolvedValue([{ project: 'default', maps: 1, nodes: 3 }])
  api.listMaps.mockResolvedValue([mapView()])
  api.getMap.mockResolvedValue(mapView())
  api.getGraph.mockResolvedValue(subgraph())
})
afterEach(() => {
  cleanup()
  resetConfig()
  for (const m of Object.values(api)) m.mockReset()
})

describe('MindmapsPage', () => {
  test('says so when the mindmap backend is not configured', () => {
    resetConfig()
    mount('/mindmaps')
    expect(screen.getByText(/not configured/)).toBeTruthy()
    expect(api.listMaps).not.toHaveBeenCalled()
  })

  test('lists maps and links each to its route', async () => {
    mount('/mindmaps')
    const link = await screen.findByRole('link', { name: /Research map/ })
    expect(link.getAttribute('href')).toBe('/mindmaps/M-1')
  })

  test('opens a map and the node named by ?node=', async () => {
    mount('/mindmaps/M-1?node=N-2&direction=D-1')
    expect((await screen.findByTestId('node-panel')).textContent).toBe('N-2')
    expect(api.getMap).toHaveBeenCalledWith('M-1')
    expect(api.getGraph).toHaveBeenCalledWith('M-1')
  })

  test('selecting a graph node puts it in the URL and keeps the direction', async () => {
    const u = userEvent.setup()
    mount('/mindmaps/M-1?direction=D-1')
    await u.click(await screen.findByRole('button', { name: 'graph N-3' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/mindmaps/M-1?node=N-3&direction=D-1'))
  })

  test('a node that is not in the graph opens no panel', async () => {
    mount('/mindmaps/M-1?node=N-99')
    await screen.findByRole('button', { name: 'graph N-1' })
    expect(screen.queryByTestId('node-panel')).toBeNull()
  })
})
