/** Pure conversion of a map subgraph to React Flow nodes and edges, with dagre positions (deterministic for equal input). */
import { Graph, layout } from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { NodeStub, Subgraph } from './api';

export type Direction = 'TB' | 'LR';
export const NODE_W = 220;
export const NODE_H = 76;

export interface MindNodeData extends Record<string, unknown> {
  node: NodeStub;
}
export type MindNode = Node<MindNodeData, 'mind'>;
export interface MindEdgeData extends Record<string, unknown> {
  /** `parent` for the tree edges, otherwise the typed edge's key. */
  edgeKey: string | null;
}
export type MindEdge = Edge<MindEdgeData>;

export function toFlow(graph: Subgraph, dir: Direction): { nodes: MindNode[]; edges: MindEdge[] } {
  const g = new Graph();
  g.setGraph({ rankdir: dir, nodesep: 32, ranksep: 64 });
  g.setDefaultEdgeLabel(() => ({}));
  const keys = new Set(graph.nodes.map((n) => n.key));
  for (const n of graph.nodes) g.setNode(n.key, { width: NODE_W, height: NODE_H });
  const edges: MindEdge[] = [];
  for (const n of graph.nodes) {
    if (n.parent === null || !keys.has(n.parent)) continue;
    g.setEdge(n.parent, n.key);
    edges.push({ id: `parent:${n.parent}:${n.key}`, source: n.parent, target: n.key, type: 'smoothstep', data: { edgeKey: null } });
  }
  for (const e of graph.edges) {
    if (!keys.has(e.src) || !keys.has(e.dst)) continue;
    edges.push({
      id: `edge:${e.key}`,
      source: e.src,
      target: e.dst,
      label: e.kind.replace(/_/g, ' '),
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeDasharray: '5 4' },
      data: { edgeKey: e.key },
    });
  }
  layout(g);
  const nodes: MindNode[] = graph.nodes.map((n) => {
    const p = g.node(n.key);
    return {
      id: n.key,
      type: 'mind',
      className: n.stub ? 'stub' : undefined,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      width: NODE_W,
      height: NODE_H,
      data: { node: n },
    };
  });
  return { nodes, edges };
}

/** The node whose box contains the centre of `dragged` (never itself), or null. */
export function dropTarget(dragged: { id: string; position: { x: number; y: number } }, nodes: { id: string; position: { x: number; y: number } }[]): string | null {
  const cx = dragged.position.x + NODE_W / 2;
  const cy = dragged.position.y + NODE_H / 2;
  const hit = nodes.find((n) => n.id !== dragged.id && cx >= n.position.x && cx <= n.position.x + NODE_W && cy >= n.position.y && cy <= n.position.y + NODE_H);
  return hit?.id ?? null;
}

/** Number of nodes below `key` in the loaded subgraph, following parent links. */
export function countDescendants(nodes: { key: string; parent: string | null }[], key: string): number {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n.key]);
  const seen = new Set<string>();
  const stack = [...(children.get(key) ?? [])];
  while (stack.length) {
    const k = stack.pop() as string;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...(children.get(k) ?? []));
  }
  return seen.size;
}
