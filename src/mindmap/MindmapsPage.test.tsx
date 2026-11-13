// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadConfig, resetConfig } from '../config/backends'
import { theme } from '../theme'
import { MindmapsRoute } from './routes'
import { direction, mapView, subgraph } from './testUtils'
import type { NodeStub } from './api'

const api = vi.hoisted(() => ({ listProjects: vi.fn(), listMaps: vi.fn(), getMap: vi.fn(), getGraph: vi.fn(), listDirections: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const stream = vi.hoisted(() => vi.fn())
vi.mock('./useMindmapStream', () => ({ useMindmapStream: stream }))
vi.mock('./GraphView', () => ({
  GraphView: (p: { graph: { nodes: NodeStub[] }; onSelect: (n: NodeStub) => void }) => (
    <div>{p.graph.nodes.map((n) => <button key={n.key} onClick={() => p.onSelect(n)}>{`graph ${n.key}`}</button>)}</div>
  ),
}))
vi.mock('./NodePanel', () => ({ NodePanel: (p: { nodeKey: string; mapKey?: string }) => <div data-testid="node-panel">{p.nodeKey}</div> }))
vi.mock('./DirectionsTab', () => ({
  DirectionsTab: (p: { mapKey: string; selected?: string | null }) => <div data-testid="directions-tab">{`${p.mapKey} ${p.selected ?? ''}`}</div>,
}))
vi.mock('./MapLinks', () => ({ MapLinks: (p: { mapKey: string }) => <div data-testid="map-links">{p.mapKey}</div> }))
vi.mock('./SearchBox', () => ({
  SearchBox: (p: { onOpen: (h: { key: string; map: string }) => void }) => <button onClick={() => p.onOpen({ key: 'N-3', map: 'M-1' })}>search hit</button>,
}))

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
  api.listDirections.mockResolvedValue([])
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

  test('selecting a graph node puts it in the URL', async () => {
    const u = userEvent.setup()
    mount('/mindmaps/M-1')
    await u.click(await screen.findByRole('button', { name: 'graph N-3' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/mindmaps/M-1?node=N-3'))
  })

  test('a node outside the loaded subgraph still opens its panel', async () => {
    mount('/mindmaps/M-1?node=N-99')
    await screen.findByRole('button', { name: 'graph N-1' })
    expect((await screen.findByTestId('node-panel')).textContent).toBe('N-99')
  })

  test('the stream follows the project of the open map, not the selector', async () => {
    api.getMap.mockResolvedValue(mapView({ project: 'other' }))
    mount('/mindmaps/M-1')
    await screen.findByRole('button', { name: 'graph N-1' })
    expect(stream.mock.calls.at(-1)?.[0]).toBe('other')
  })

  test('a stale map response after a fast switch is ignored', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    api.getMap.mockImplementation((k: string) => (k === 'M-1' ? new Promise((r) => { resolveOld = r }) : Promise.resolve(mapView({ key: 'M-2', title: 'Second map' }))))
    api.getGraph.mockImplementation((k: string) => (k === 'M-1' ? Promise.resolve(subgraph()) : Promise.resolve(subgraph({ nodes: [{ ...subgraph().nodes[0], key: 'N-9', map: 'M-2' }] }))))
    api.listMaps.mockResolvedValue([mapView(), mapView({ key: 'M-2', title: 'Second map' })])
    const u = userEvent.setup()
    mount('/mindmaps/M-1')
    await u.click(await screen.findByRole('link', { name: /Second map/ }))
    await screen.findByRole('button', { name: 'graph N-9' })
    resolveOld(mapView())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByRole('button', { name: 'graph N-9' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'graph N-1' })).toBeNull()
  })

  test('the map list shows the open directions per map and the node count of the shown map', async () => {
    api.listMaps.mockResolvedValue([mapView(), mapView({ key: 'M-2', title: 'Second map' })])
    api.listDirections.mockResolvedValue([direction({ map: 'M-2' }), direction({ key: 'D-2', map: 'M-2' }), direction({ key: 'D-3', map: 'M-1' })])
    mount('/mindmaps/M-1')
    const first = await screen.findByRole('link', { name: /Research map/ })
    await waitFor(() => expect(first.textContent).toMatch(/1 open direction(?!s)/))
    expect(screen.getByRole('link', { name: /Second map/ }).textContent).toMatch(/2 open directions/)
    expect(api.listDirections).toHaveBeenCalledWith({ project: null, status: 'open' })
    await waitFor(() => expect(first.textContent).toMatch(/3 nodes/))
  })

  test('the Links tab shows the map links', async () => {
    const u = userEvent.setup()
    mount('/mindmaps/M-1')
    await u.click(await screen.findByRole('tab', { name: 'Links' }))
    expect(screen.getByTestId('map-links').textContent).toBe('M-1')
  })

  test('?direction= opens the directions tab with that direction selected', async () => {
    mount('/mindmaps/M-1?direction=D-2')
    expect((await screen.findByTestId('directions-tab')).textContent).toBe('M-1 D-2')
  })

  test('the Directions tab opens without a URL change and Graph goes back, dropping the direction', async () => {
    const u = userEvent.setup()
    mount('/mindmaps/M-1?node=N-2&direction=D-2')
    await u.click(await screen.findByRole('tab', { name: 'Graph' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/mindmaps/M-1?node=N-2'))
    expect(screen.queryByTestId('directions-tab')).toBeNull()
    await u.click(screen.getByRole('tab', { name: 'Directions' }))
    expect(screen.getByTestId('directions-tab')).toBeTruthy()
  })

  test('the graph is the default tab', async () => {
    mount('/mindmaps/M-1')
    await screen.findByRole('button', { name: 'graph N-1' })
    expect(screen.queryByTestId('directions-tab')).toBeNull()
  })

  test('a search hit opens its map and node', async () => {
    const u = userEvent.setup()
    mount('/mindmaps')
    await u.click(await screen.findByRole('button', { name: 'search hit' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/mindmaps/M-1?node=N-3'))
  })
})
