import { describe, expect, it } from 'vitest';
import { mapPath } from './paths';

describe('mapPath', () => {
  it('builds the index, a map and a selection', () => {
    expect(mapPath()).toBe('/mindmaps');
    expect(mapPath('M-3')).toBe('/mindmaps/M-3');
    expect(mapPath('M-3', { node: 'N-7' })).toBe('/mindmaps/M-3?node=N-7');
    expect(mapPath('M-3', { node: 'N-7', direction: 'D-2' })).toBe('/mindmaps/M-3?node=N-7&direction=D-2');
  });
});
