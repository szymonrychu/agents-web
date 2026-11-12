import type { DirectionView, EdgeView, GrowthView, LinkView, MapView, NodeStub, NodeView, Subgraph } from './api'

const TS = '2026-11-01T10:00:00Z'

export const mapView = (over: Partial<MapView> = {}): MapView => ({
  key: 'M-1', project: 'default', slug: 'research', title: 'Research map', description: 'About things', kind: 'research', status: 'active', root: 'N-1',
  created_by: 'user', created_at: TS, updated_at: TS, version: 1, ...over,
})

export const stub = (over: Partial<NodeStub> = {}): NodeStub => ({
  key: 'N-1', map: 'M-1', project: 'default', topic: 'Root topic', status: 'growing', parent: null, depth: 0, open_growth_areas: 0, embedding_pending: false, stub: false, ...over,
})

export const edgeView = (over: Partial<EdgeView> = {}): EdgeView => ({
  key: 'E-1', src: 'N-2', src_project: 'default', dst: 'N-3', dst_project: 'default', kind: 'relates_to', note: '', created_by: 'user', created_at: TS, ...over,
})

export const subgraph = (over: Partial<Subgraph> = {}): Subgraph => ({
  nodes: [stub(), stub({ key: 'N-2', topic: 'Child A', parent: 'N-1', depth: 1 }), stub({ key: 'N-3', topic: 'Child B', parent: 'N-1', depth: 1 })],
  edges: [],
  truncated: false,
  ...over,
})

export const growth = (over: Partial<GrowthView> = {}): GrowthView => ({
  key: 'G-1', node: 'N-2', text: 'Look into X', status: 'open', task_key: null, grown_node: null, direction: null, position: 0, created_by: 'user', created_at: TS, updated_at: TS, version: 1, ...over,
})

export const link = (over: Partial<LinkView> = {}): LinkView => ({
  id: 5, map: 'M-1', node: 'N-2', project: 'default', ref_key: 'T-12', relation: 'implements', note: '', created_by: 'user', created_at: TS, ...over,
})

export const direction = (over: Partial<DirectionView> = {}): DirectionView => ({
  key: 'D-1', map: 'M-1', node: 'N-2', project: 'default', text: 'Go deeper', origin: 'user', status: 'open', created_by: 'user', acknowledged_by: null,
  acknowledged_at: null, resolution: '', resolved_by: null, resolved_at: null, created_at: TS, updated_at: TS, version: 1, growth_areas: [], ...over,
})

export const nodeView = (over: Partial<NodeView> = {}): NodeView => ({
  key: 'N-2', map: 'M-1', project: 'default', topic: 'Child A', notes: '# Findings\n\nSome **bold** notes', status: 'growing', parent: 'N-1', version: 3, current_version: 3, content_rev: 3,
  embedding_pending: false, created_by: 'user', created_at: TS, updated_by: 'user', updated_at: TS, growth_areas: [growth()], edges: [], links: [link()], directions: [], ...over,
})
