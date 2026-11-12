// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { GraphView } from './GraphView'
import { nodeView, subgraph } from './testUtils'

// jsdom has no layout: a stand-in React Flow renders the nodes and exposes its drag and connect callbacks as buttons.
vi.mock('@xyflow/react', async (orig) => {
  const real = await orig<typeof import('@xyflow/react')>()
  return {
    ...real,
    Handle: () => null,
    Background: () => null,
    Controls: () => null,
    ReactFlow: (p: {
      nodes: { id: string; position: { x: number; y: number }; data: { node: { topic: string } } }[]
      onNodeDragStop: (e: unknown, n: unknown, all: unknown[]) => void
      onConnect: (c: { source: string; target: string }) => void
      onNodeClick: (e: unknown, n: unknown) => void
    }) => (
      <div>
        {p.nodes.map((n) => <button key={n.id} onClick={(e) => p.onNodeClick(e, n)}>{n.data.node.topic}</button>)}
        <button onClick={() => {
          const target = p.nodes.find((n) => n.id === 'N-2')!
          const dragged = p.nodes.find((n) => n.id === 'N-3')!
          p.onNodeDragStop(null, { ...dragged, position: target.position }, p.nodes)
        }}>drag N-3 onto N-2</button>
        <button onClick={() => {
          const dragged = p.nodes.find((n) => n.id === 'N-3')!
          p.onNodeDragStop(null, { ...dragged, position: { x: 9000, y: 9000 } }, p.nodes)
        }}>drag N-3 away</button>
        <button onClick={() => {
          const root = p.nodes.find((n) => n.id === 'N-1')!
          const target = p.nodes.find((n) => n.id === 'N-2')!
          p.onNodeDragStop(null, { ...root, position: target.position }, p.nodes)
        }}>drag root onto N-2</button>
        <button onClick={() => p.onConnect({ source: 'N-2', target: 'N-3' })}>connect N-2 to N-3</button>
      </div>
    ),
  }
})

const api = vi.hoisted(() => ({ getNode: vi.fn(), patchNode: vi.fn(), createEdge: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const mount = (over: Partial<Parameters<typeof GraphView>[0]> = {}) => {
  const props = { graph: subgraph(), dir: 'TB' as const, selected: null, onSelect: vi.fn(), onChanged: vi.fn(), ...over }
  render(<ThemeProvider theme={theme}><GraphView {...props} /></ThemeProvider>)
  return props
}
const user = () => userEvent.setup()

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset()
  api.getNode.mockResolvedValue(nodeView({ key: 'N-3', version: 8 }))
  api.patchNode.mockResolvedValue(nodeView())
  api.createEdge.mockResolvedValue({})
})
afterEach(cleanup)

describe('GraphView', () => {
  test('selects a node by click', async () => {
    const props = mount()
    await user().click(screen.getByRole('button', { name: 'Child A' }))
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'N-2' }))
  })

  test('dragging a node onto another opens a confirm dialog and PATCHes the parent', async () => {
    const u = user()
    const props = mount()
    await u.click(screen.getByRole('button', { name: 'drag N-3 onto N-2' }))
    expect(screen.getByText(/under/).textContent).toMatch(/Child B.*under.*Child A/)
    expect(api.patchNode).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledWith('N-3', { version: 8, parent: 'N-2' }))
    expect(props.onChanged).toHaveBeenCalled()
  })

  test('cancelling the confirm changes nothing', async () => {
    const u = user()
    const props = mount()
    await u.click(screen.getByRole('button', { name: 'drag N-3 onto N-2' }))
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.patchNode).not.toHaveBeenCalled()
    expect(props.onChanged).not.toHaveBeenCalled()
  })

  test('a drop on empty canvas, on the root or of the root asks nothing', async () => {
    const u = user()
    mount()
    await u.click(screen.getByRole('button', { name: 'drag N-3 away' }))
    await u.click(screen.getByRole('button', { name: 'drag root onto N-2' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('connecting handles opens the kind picker and POSTs the edge', async () => {
    const u = user()
    const props = mount()
    await u.click(screen.getByRole('button', { name: 'connect N-2 to N-3' }))
    expect(screen.getByLabelText('Edge kind')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Create edge' }))
    await waitFor(() => expect(api.createEdge).toHaveBeenCalledWith({ src: 'N-2', dst: 'N-3', kind: 'relates_to', note: '' }))
    expect(props.onChanged).toHaveBeenCalled()
  })
})
