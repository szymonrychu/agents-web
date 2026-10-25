import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, backendBase, isConfigured, loadConfig, parseConfig, resetConfig } from './backends';

const orch = { id: 'orchestrator', label: 'Orchestrator', basePath: '/api/v1' };
const cfg = (...extra: unknown[]) => ({ backends: [orch, ...extra] });

afterEach(() => resetConfig());

describe('parseConfig', () => {
  it('accepts a valid config and ignores unknown keys', () => {
    const r = parseConfig({ extra: 1, backends: [{ ...orch, more: true }, { id: 'a-1', label: 'A', basePath: '/a/api' }] });
    expect(r.backends).toEqual([orch, { id: 'a-1', label: 'A', basePath: '/a/api' }]);
  });

  it.each([
    ['backends not an array', { backends: {} }, 'backends'],
    ['config not an object', null, 'backends'],
    ['bad id', cfg({ id: 'Bad', label: 'x', basePath: '/x' }), 'id'],
    ['id starting with digit', cfg({ id: '1a', label: 'x', basePath: '/x' }), 'id'],
    ['duplicate id', cfg({ ...orch }), 'id'],
    ['empty label', cfg({ id: 'b', label: '', basePath: '/x' }), 'label'],
    ['basePath without leading slash', cfg({ id: 'b', label: 'b', basePath: 'x' }), 'basePath'],
    ['basePath trailing slash', cfg({ id: 'b', label: 'b', basePath: '/x/' }), 'basePath'],
    ['basePath double slash', cfg({ id: 'b', label: 'b', basePath: '/x//y' }), 'basePath'],
    ['basePath scheme', cfg({ id: 'b', label: 'b', basePath: '/x://y' }), 'basePath'],
    ['basePath query', cfg({ id: 'b', label: 'b', basePath: '/x?y' }), 'basePath'],
    ['basePath fragment', cfg({ id: 'b', label: 'b', basePath: '/x#y' }), 'basePath'],
    ['no orchestrator', { backends: [{ id: 'other', label: 'o', basePath: '/o' }] }, 'orchestrator'],
  ])('rejects %s naming the field', (_n, input, field) => {
    expect(() => parseConfig(input)).toThrow(ConfigError);
    expect(() => parseConfig(input)).toThrow(field);
  });
});

describe('loadConfig', () => {
  it('fetches /config.json uncached and makes it current', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(cfg({ id: 'x', label: 'X', basePath: '/x/api' }))));
    await loadConfig(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
    expect(backendBase('x')).toBe('/x/api');
    expect(isConfigured('x')).toBe(true);
    expect(isConfigured('y')).toBe(false);
    expect(() => backendBase('y')).toThrow(ConfigError);
  });

  it('rejects a 500 naming the status', async () => {
    const f = vi.fn(async () => new Response('no', { status: 500 }));
    await expect(loadConfig(f as unknown as typeof fetch)).rejects.toThrow(/500/);
    await expect(loadConfig(f as unknown as typeof fetch)).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects a body that is not JSON', async () => {
    const f = vi.fn(async () => new Response('<html>'));
    await expect(loadConfig(f as unknown as typeof fetch)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('defaults', () => {
  it('serves /api/v1 for the orchestrator before any load', () => {
    expect(backendBase('orchestrator')).toBe('/api/v1');
  });
});
