// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { ArchiveDialog, DeleteDialog, GrowthDialog, LinkDialog, MapDialog, NodeDialog } from './EditDialogs'
import { growth, mapView, nodeView } from './testUtils'

const api = vi.hoisted(() => ({
  createMap: vi.fn(), patchMap: vi.fn(), deleteMap: vi.fn(), createNode: vi.fn(), patchNode: vi.fn(), deleteNode: vi.fn(),
  createGrowth: vi.fn(), patchGrowth: vi.fn(), deleteGrowth: vi.fn(), deleteEdge: vi.fn(), createMapLink: vi.fn(), createNodeLink: vi.fn(), deleteLink: vi.fn(),
}))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const mount = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
const user = () => userEvent.setup()

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

describe('MapDialog', () => {
  test('creates a map once project, slug and title are given', async () => {
    const onSaved = vi.fn()
    const u = user()
    mount(<MapDialog project="default" onClose={() => {}} onSaved={onSaved} />)
    const create = screen.getByRole('button', { name: 'Create' })
    expect((create as HTMLButtonElement).disabled).toBe(true)
    await u.type(screen.getByLabelText(/Slug/), 'my-map')
    await u.type(screen.getByLabelText(/^Title/), 'My map')
    await u.click(create)
    await waitFor(() => expect(api.createMap).toHaveBeenCalledWith({ project: 'default', slug: 'my-map', title: 'My map', description: '', kind: 'research', root_topic: null }))
    expect(onSaved).toHaveBeenCalled()
  })

  test('edits title and description with the map version', async () => {
    const u = user()
    mount(<MapDialog map={mapView({ version: 4 })} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryByLabelText(/Slug/)).toBeNull()
    await u.clear(screen.getByLabelText(/^Title/))
    await u.type(screen.getByLabelText(/^Title/), 'Renamed')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchMap).toHaveBeenCalledWith('M-1', { version: 4, title: 'Renamed', description: 'About things' }))
  })

  test('shows the server error and stays open', async () => {
    api.createMap.mockRejectedValue(new Error('slug_taken'))
    const u = user()
    mount(<MapDialog project="p" onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Slug/), 's')
    await u.type(screen.getByLabelText(/^Title/), 't')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText(/slug_taken/)).toBeTruthy()
  })
})

describe('NodeDialog', () => {
  test('creates a node under its parent', async () => {
    const u = user()
    mount(<NodeDialog mapKey="M-1" parent="N-1" onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Topic/), 'Sub topic')
    await u.type(screen.getByLabelText(/Notes/), 'text')
    await u.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createNode).toHaveBeenCalledWith('M-1', { topic: 'Sub topic', summary: '', notes: 'text', status: 'seed', parent: 'N-1' }))
  })
})

describe('GrowthDialog', () => {
  test('adds a growth area', async () => {
    const u = user()
    mount(<GrowthDialog nodeKey="N-2" onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Growth area/), 'Dig into X')
    await u.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.createGrowth).toHaveBeenCalledWith('N-2', 'Dig into X'))
  })

  test('edits text and keeps the version', async () => {
    const u = user()
    mount(<GrowthDialog nodeKey="N-2" growth={growth({ version: 6 })} onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Growth area/), '!')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patchGrowth).toHaveBeenCalledWith('G-1', { version: 6, text: 'Look into X!', status: 'open' }))
  })
})

describe('LinkDialog', () => {
  test('links to a node and to a map', async () => {
    const u = user()
    const { unmount } = mount(<LinkDialog target={{ kind: 'node', key: 'N-2' }} onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Task or spec key/), 'T-12')
    await u.click(screen.getByRole('button', { name: 'Add link' }))
    await waitFor(() => expect(api.createNodeLink).toHaveBeenCalledWith('N-2', { ref_key: 'T-12', relation: 'researched_by', note: '' }))
    unmount()
    mount(<LinkDialog target={{ kind: 'map', key: 'M-1' }} onClose={() => {}} onSaved={() => {}} />)
    await u.type(screen.getByLabelText(/Task or spec key/), 'S-3')
    await u.click(screen.getByRole('button', { name: 'Add link' }))
    await waitFor(() => expect(api.createMapLink).toHaveBeenCalledWith('M-1', { ref_key: 'S-3', relation: 'researched_by', note: '' }))
  })
})

describe('ArchiveDialog', () => {
  test('archives a map and a node through their status', async () => {
    const u = user()
    const { unmount } = mount(<ArchiveDialog target={{ kind: 'map', item: mapView({ version: 2 }) }} onClose={() => {}} onSaved={() => {}} />)
    await u.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.patchMap).toHaveBeenCalledWith('M-1', { version: 2, status: 'archived' }))
    unmount()
    mount(<ArchiveDialog target={{ kind: 'node', item: nodeView({ version: 5 }) }} onClose={() => {}} onSaved={() => {}} />)
    await u.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.patchNode).toHaveBeenCalledWith('N-2', { version: 5, status: 'archived' }))
  })
})

describe('DeleteDialog', () => {
  test('names what a map delete cascades to and deletes on confirm', async () => {
    const onDeleted = vi.fn()
    const u = user()
    mount(<DeleteDialog target={{ kind: 'map', key: 'M-1', label: 'Research map' }} onClose={() => {}} onDeleted={onDeleted} />)
    expect(screen.getByText(/every node of the map with its versions, growth areas, edges, links and directions/)).toBeTruthy()
    expect(api.deleteMap).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteMap).toHaveBeenCalledWith('M-1'))
    expect(onDeleted).toHaveBeenCalled()
  })

  test('names the subtree of a node delete', async () => {
    const u = user()
    mount(<DeleteDialog target={{ kind: 'node', key: 'N-2', label: 'Child A' }} onClose={() => {}} onDeleted={() => {}} />)
    expect(screen.getByText(/all its descendant nodes/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteNode).toHaveBeenCalledWith('N-2'))
  })

  test('deletes a growth area, an edge and a link', async () => {
    const u = user()
    for (const [target, fn, arg] of [
      [{ kind: 'growth', key: 'G-1', label: 'g' }, api.deleteGrowth, 'G-1'],
      [{ kind: 'edge', key: 'E-1', label: 'e' }, api.deleteEdge, 'E-1'],
      [{ kind: 'link', id: 5, label: 'l' }, api.deleteLink, 5],
    ] as const) {
      const { unmount } = mount(<DeleteDialog target={target} onClose={() => {}} onDeleted={() => {}} />)
      await u.click(screen.getByRole('button', { name: 'Delete' }))
      await waitFor(() => expect(fn).toHaveBeenCalledWith(arg))
      unmount()
    }
  })
})
