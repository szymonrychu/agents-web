import { isValidElement } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SessionsPage } from '../sessions/SessionsPage'
import { SchedulesPage } from '../schedules/SchedulesPage'
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
  test('sessions entry', () => {
    const sessions = menuEntries(config('orchestrator')).find((e) => e.id === 'sessions')
    expect(sessions).toMatchObject({ id: 'sessions', label: 'Sessions', order: 10, backend: 'orchestrator' })
    const onBack = vi.fn()
    const openSession = vi.fn()
    const page = sessions!.render(onBack, openSession)
    expect(isValidElement(page) && page.type).toBe(SessionsPage)
    expect(isValidElement<{ onBack: unknown; onOpen: unknown }>(page) && page.props).toEqual({ onBack, onOpen: openSession })
  })

  test('default_orchestrator_has_sessions_at_10_and_presets_at_40', () => {
    expect(menuEntries(config('orchestrator')).map((e) => [e.id, e.order])).toEqual([['sessions', 10], ['presets', 40]])
  })

  test('webhooks_sits_between_sessions_and_presets_only_when_configured', () => {
    expect(menuEntries(config('orchestrator', 'webhooks')).map((e) => e.id)).toEqual(['sessions', 'webhooks', 'presets'])
    expect(menuEntries(config('orchestrator')).map((e) => e.id)).not.toContain('webhooks')
  })

  test('schedules order', () => {
    expect(menuEntries(config('orchestrator', 'webhooks', 'schedules')).map((e) => [e.id, e.order])).toEqual([
      ['sessions', 10],
      ['webhooks', 20],
      ['schedules', 30],
      ['presets', 40],
    ])
  })

  test('schedules hidden', () => {
    expect(menuEntries(config('orchestrator', 'webhooks')).map((e) => e.id)).not.toContain('schedules')
  })

  test('schedules render', () => {
    const schedules = menuEntries(config('schedules')).find((e) => e.id === 'schedules')
    expect(schedules).toMatchObject({ label: 'Schedules', order: 30, backend: 'schedules' })
    const onBack = vi.fn()
    const openSession = vi.fn()
    const page = schedules!.render(onBack, openSession)
    expect(isValidElement(page) && page.type).toBe(SchedulesPage)
    expect(isValidElement<{ onBack: unknown; onOpenSession: unknown }>(page) && page.props).toEqual({ onBack, onOpenSession: openSession })
  })

  test('filters_by_configured_backends', () => {
    BACKEND_MENUS.extra = [entry('x', 'Extra', 5, 'extra')]
    expect(menuEntries(config('orchestrator')).map((e) => e.id)).toEqual(['sessions', 'presets'])
    expect(menuEntries(config('orchestrator', 'extra')).map((e) => e.id)).toEqual(['x', 'sessions', 'presets'])
  })

  test('orders_by_order_then_label', () => {
    BACKEND_MENUS.extra = [entry('b', 'Beta', 40, 'extra'), entry('a', 'Alpha', 40, 'extra'), entry('z', 'Zed', 1, 'extra')]
    expect(menuEntries(config('orchestrator', 'extra')).map((e) => e.id)).toEqual(['z', 'sessions', 'a', 'b', 'presets'])
  })

  test('warns_once_for_unregistered_id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(menuEntries(config('orchestrator', 'other')).map((e) => e.id)).toEqual(['sessions', 'presets'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('other')
  })
})
