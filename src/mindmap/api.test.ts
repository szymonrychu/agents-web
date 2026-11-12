import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { loadConfig, resetConfig } from '../config/backends';
import {
  conflictVersion, createEdge, createGrowth, createMap, createNode, createNodeLink, deleteEdge, deleteGrowth, deleteLink, deleteMap,
  deleteNode, getGraph, getMap, getNode, listLinks, listMaps, listProjects, mindmapEnabled, mindmapStreamUrl, patchGrowth, patchMap, patchNode,
} from './api';

const BASE = '/mindmap/api/v1';
let f: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await loadConfig(vi.fn(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'mindmap', label: 'M', basePath: BASE }] }))));
  f = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', f);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetConfig();
});

const call = () => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: init.body };
};

describe('mindmap api routes', () => {
  it('is enabled when configured and builds the stream url', () => {
    expect(mindmapEnabled()).toBe(true);
    expect(mindmapStreamUrl('p1')).toBe(`${BASE}/stream?project=p1`);
    expect(mindmapStreamUrl(null)).toBe(`${BASE}/stream`);
  });
  it('reads projects, maps and the graph', async () => {
    await listProjects();
    expect(call()).toMatchObject({ url: `${BASE}/projects`, method: 'GET' });
    f.mockClear();
    await listMaps({ project: 'p1', status: 'active' });
    expect(call().url).toBe(`${BASE}/maps?project=p1&status=active`);
    f.mockClear();
    await getMap('M-1');
    expect(call().url).toBe(`${BASE}/maps/M-1`);
    f.mockClear();
    await getGraph('M-1');
    expect(call().url).toBe(`${BASE}/maps/M-1/graph`);
  });
  it('writes maps', async () => {
    await createMap({ project: 'p', slug: 's', title: 'T' });
    expect(call()).toMatchObject({ url: `${BASE}/maps`, method: 'POST' });
    f.mockClear();
    await patchMap('M-1', { version: 2, status: 'archived' });
    expect(call()).toMatchObject({ url: `${BASE}/maps/M-1`, method: 'PATCH', body: '{"version":2,"status":"archived"}' });
    f.mockClear();
    await deleteMap('M-1');
    expect(call()).toMatchObject({ url: `${BASE}/maps/M-1`, method: 'DELETE' });
  });
  it('writes nodes', async () => {
    await getNode('N-4');
    expect(call().url).toBe(`${BASE}/nodes/N-4`);
    f.mockClear();
    await createNode('M-1', { topic: 't', parent: 'N-1' });
    expect(call()).toMatchObject({ url: `${BASE}/maps/M-1/nodes`, method: 'POST' });
    f.mockClear();
    await patchNode('N-4', { version: 3, parent: 'N-2' });
    expect(call()).toMatchObject({ url: `${BASE}/nodes/N-4`, method: 'PATCH', body: '{"version":3,"parent":"N-2"}' });
    f.mockClear();
    await deleteNode('N-4');
    expect(call()).toMatchObject({ url: `${BASE}/nodes/N-4`, method: 'DELETE' });
  });
  it('writes growth areas, edges and links', async () => {
    await createGrowth('N-4', 'g');
    expect(call()).toMatchObject({ url: `${BASE}/nodes/N-4/growth-areas`, method: 'POST', body: '{"text":"g"}' });
    f.mockClear();
    await patchGrowth('G-1', { version: 1, status: 'dropped' });
    expect(call()).toMatchObject({ url: `${BASE}/growth-areas/G-1`, method: 'PATCH' });
    f.mockClear();
    await deleteGrowth('G-1');
    expect(call()).toMatchObject({ url: `${BASE}/growth-areas/G-1`, method: 'DELETE' });
    f.mockClear();
    await createEdge({ src: 'N-1', dst: 'N-2', kind: 'builds_on' });
    expect(call()).toMatchObject({ url: `${BASE}/edges`, method: 'POST' });
    f.mockClear();
    await deleteEdge('E-1');
    expect(call()).toMatchObject({ url: `${BASE}/edges/E-1`, method: 'DELETE' });
    f.mockClear();
    await createNodeLink('N-4', { ref_key: 'T-1', relation: 'implements' });
    expect(call()).toMatchObject({ url: `${BASE}/nodes/N-4/links`, method: 'POST' });
    f.mockClear();
    await deleteLink(9);
    expect(call()).toMatchObject({ url: `${BASE}/links/9`, method: 'DELETE' });
    f.mockClear();
    await listLinks('T-1');
    expect(call().url).toBe(`${BASE}/links?key=T-1`);
  });
});

describe('version conflicts', () => {
  it('surfaces current_version from the nested 409 body', async () => {
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'version_conflict', message: 'stale', current_version: 7 } }), { status: 409 }));
    const err = await patchNode('N-4', { version: 3, summary: 's' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect(conflictVersion(err)).toBe(7);
  });
  it('is undefined for other errors', () => {
    expect(conflictVersion(new ApiError(409, 'slug_taken', 'x'))).toBeUndefined();
    expect(conflictVersion(new Error('x'))).toBeUndefined();
  });
});
