/** Typed access to the agents-mindmap web API, over the `mindmap` backend's base path. */
import { ApiError, query, requestAt } from '../api/client';
import { backendBase, isConfigured } from '../config/backends';
import type { components } from '../api/mindmap-schema';

type S = components['schemas'];
export type MapView = S['MapView'];
export type NodeView = S['NodeView'];
export type NodeStub = S['NodeStubView'];
export type EdgeView = S['EdgeView'];
export type Subgraph = S['SubgraphView'];
export type GrowthView = S['GrowthView'];
export type LinkView = S['LinkView'];
export type DirectionView = S['DirectionView'];
export type ProjectCount = S['ProjectCount'];
export type EventView = S['EventView'];
/** The generated request types mark defaulted fields required; a request may leave them out. */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type MapIn = Optional<S['MapIn'], 'description' | 'kind'>;
export type MapPatch = S['MapPatch'];
export type NodeIn = Optional<S['NodeIn'], 'notes' | 'status' | 'summary' | 'edges' | 'links' | 'growth_areas'>;
export type NodePatch = S['NodePatch'];
export type GrowthPatch = S['GrowthPatch'];
export type EdgeIn = Optional<S['EdgeIn'], 'kind' | 'note'>;
export type LinkIn = Optional<S['LinkIn'], 'note'>;
export type NodeStatus = NonNullable<NodePatch['status']>;
export type EdgeKind = NonNullable<EdgeIn['kind']>;
export type LinkRelation = LinkIn['relation'];
export type GrowthStatus = NonNullable<GrowthPatch['status']>;

export const NODE_STATUSES: NodeStatus[] = ['seed', 'growing', 'settled', 'stale', 'archived'];
export const EDGE_KINDS: EdgeKind[] = ['relates_to', 'builds_on', 'derived_from', 'contradicts', 'supersedes', 'see_also'];
export const LINK_RELATIONS: LinkRelation[] = ['researched_by', 'informs', 'grown_by', 'implements', 'cites', 'uses'];
export const GROWTH_STATUSES: GrowthStatus[] = ['open', 'taken', 'grown', 'dropped'];

const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('mindmap'), method, path, body);
const id = encodeURIComponent;

/** True when the runtime config lists a `mindmap` backend. */
export const mindmapEnabled = () => isConfigured('mindmap');
export const mindmapStreamUrl = (project: string | null | undefined) => `${backendBase('mindmap')}/stream${query({ project: project || undefined })}`;

/** The row version a 409 `version_conflict` answer reports (undefined for any other error). */
export const conflictVersion = (e: unknown): number | undefined =>
  e instanceof ApiError && e.status === 409 && typeof e.details.current_version === 'number' ? e.details.current_version : undefined;

export const listProjects = () => req<ProjectCount[]>('GET', '/projects');
export const listMaps = (q: { project?: string | null; status?: 'active' | 'archived'; kind?: 'research' | 'knowledge' } = {}) =>
  req<MapView[]>('GET', `/maps${query({ project: q.project || undefined, status: q.status, kind: q.kind })}`);
export const getMap = (key: string) => req<MapView>('GET', `/maps/${id(key)}`);
export const createMap = (body: MapIn) => req<MapView>('POST', '/maps', body);
export const patchMap = (key: string, body: MapPatch) => req<MapView>('PATCH', `/maps/${id(key)}`, body);
/** Hard delete; cascades to the map's nodes, growth areas, edges, links and directions. */
export const deleteMap = (key: string) => req<void>('DELETE', `/maps/${id(key)}`);
export const getGraph = (key: string, depth?: number) => req<Subgraph>('GET', `/maps/${id(key)}/graph${query({ depth })}`);

export const getNode = (key: string) => req<NodeView>('GET', `/nodes/${id(key)}`);
export const createNode = (mapKey: string, body: NodeIn) => req<NodeView>('POST', `/maps/${id(mapKey)}/nodes`, body);
export const patchNode = (key: string, body: NodePatch) => req<NodeView>('PATCH', `/nodes/${id(key)}`, body);
export const deleteNode = (key: string) => req<void>('DELETE', `/nodes/${id(key)}`);

export const createGrowth = (nodeKey: string, text: string) => req<GrowthView>('POST', `/nodes/${id(nodeKey)}/growth-areas`, { text });
export const patchGrowth = (key: string, body: GrowthPatch) => req<GrowthView>('PATCH', `/growth-areas/${id(key)}`, body);
export const deleteGrowth = (key: string) => req<void>('DELETE', `/growth-areas/${id(key)}`);

export const createEdge = (body: EdgeIn) => req<EdgeView>('POST', '/edges', body);
export const deleteEdge = (key: string) => req<void>('DELETE', `/edges/${id(key)}`);

export const listLinks = (refKey: string) => req<LinkView[]>('GET', `/links${query({ key: refKey })}`);
export const createMapLink = (mapKey: string, body: LinkIn) => req<LinkView>('POST', `/maps/${id(mapKey)}/links`, body);
export const createNodeLink = (nodeKey: string, body: LinkIn) => req<LinkView>('POST', `/nodes/${id(nodeKey)}/links`, body);
export const deleteLink = (linkId: number) => req<void>('DELETE', `/links/${linkId}`);
