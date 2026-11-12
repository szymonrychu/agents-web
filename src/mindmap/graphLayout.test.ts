import { describe, expect, it } from 'vitest';
import { dropTarget, NODE_H, NODE_W, toFlow } from './graphLayout';
import { edgeView, stub, subgraph } from './testUtils';

describe('toFlow', () => {
  it('gives identical positions for the same input twice', () => {
    const g = subgraph({ edges: [edgeView()] });
    expect(toFlow(g, 'TB')).toEqual(toFlow(g, 'TB'));
    expect(toFlow(g, 'LR').nodes.map((n) => n.position)).toEqual(toFlow(g, 'LR').nodes.map((n) => n.position));
  });
  it('lays the tree top-down or left-right', () => {
    const tb = toFlow(subgraph(), 'TB').nodes;
    expect(tb[1].position.y).toBeGreaterThan(tb[0].position.y);
    const lr = toFlow(subgraph(), 'LR').nodes;
    expect(lr[1].position.x).toBeGreaterThan(lr[0].position.x);
  });
  it('makes one tree edge per parent and one labelled edge per typed edge', () => {
    const { edges } = toFlow(subgraph({ edges: [edgeView({ kind: 'builds_on' })] }), 'TB');
    expect(edges.filter((e) => e.data?.edgeKey === null).map((e) => [e.source, e.target])).toEqual([['N-1', 'N-2'], ['N-1', 'N-3']]);
    expect(edges.find((e) => e.data?.edgeKey === 'E-1')).toMatchObject({ source: 'N-2', target: 'N-3', label: 'builds on' });
  });
  it('gives a cross-project stub the class stub and keeps the others plain', () => {
    const g = subgraph({ nodes: [stub(), stub({ key: 'N-9', project: 'other', stub: true, parent: null, depth: 0 })] });
    const nodes = toFlow(g, 'TB').nodes;
    expect(nodes.find((n) => n.id === 'N-9')?.className).toBe('stub');
    expect(nodes.find((n) => n.id === 'N-1')?.className).toBeUndefined();
  });
  it('drops edges whose end is not in the graph', () => {
    const { edges } = toFlow(subgraph({ edges: [edgeView({ dst: 'N-99' })] }), 'TB');
    expect(edges.some((e) => e.data?.edgeKey === 'E-1')).toBe(false);
  });
});

describe('dropTarget', () => {
  const nodes = [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 500, y: 0 } }];
  it('finds the node under the dragged centre, never the dragged one', () => {
    expect(dropTarget({ id: 'b', position: { x: 10 - NODE_W / 2, y: 10 - NODE_H / 2 } }, nodes)).toBe('a');
    expect(dropTarget({ id: 'a', position: { x: 0, y: 0 } }, nodes)).toBeNull();
    expect(dropTarget({ id: 'a', position: { x: 2000, y: 2000 } }, nodes)).toBeNull();
  });
});
