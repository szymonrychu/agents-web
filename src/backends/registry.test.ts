import { afterEach, describe, expect, test, vi } from 'vitest'
import type { RuntimeConfig } from '../config/backends'
import { BACKEND_MENUS, menuEntries, type MenuEntry } from './registry'

const entry = (id: string, label: string, order: number, backend: string): MenuEntry => ({ id, label, order, backend, render: () => null })
const config = (...ids: string[]): RuntimeConfig => ({ backends: ids.map((id) => ({ id, label: id, basePath: `/${id}` })) })

afterEach(() => {
  delete BACKEND_MENUS.extra
  delete BACKEND_MENUS.other
  vi.restoreAllMocks()
})

describe('menuEntries', () => {
  test('default_orchestrator_has_clusters_at_10_and_presets_at_40', () => {
    expect(menuEntries(config('orchestrator')).map((e) => [e.id, e.order])).toEqual([['clusters', 10], ['presets', 40]])
  })

  test('webhooks_sits_between_clusters_and_presets_only_when_configured', () => {
    expect(menuEntries(config('orchestrator', 'webhooks')).map((e) => e.id)).toEqual(['clusters', 'webhooks', 'presets'])
    expect(menuEntries(config('orchestrator')).map((e) => e.id)).not.toContain('webhooks')
  })

  test('filters_by_configured_backends', () => {
    BACKEND_MENUS.extra = [entry('x', 'Extra', 5, 'extra')]
    expect(menuEntries(config('orchestrator')).map((e) => e.id)).toEqual(['clusters', 'presets'])
    expect(menuEntries(config('orchestrator', 'extra')).map((e) => e.id)).toEqual(['x', 'clusters', 'presets'])
  })

  test('orders_by_order_then_label', () => {
    BACKEND_MENUS.extra = [entry('b', 'Beta', 40, 'extra'), entry('a', 'Alpha', 40, 'extra'), entry('z', 'Zed', 1, 'extra')]
    expect(menuEntries(config('orchestrator', 'extra')).map((e) => e.id)).toEqual(['z', 'clusters', 'a', 'b', 'presets'])
  })

  test('warns_once_for_unregistered_id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(menuEntries(config('orchestrator', 'other')).map((e) => e.id)).toEqual(['clusters', 'presets'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('other')
  })
})
