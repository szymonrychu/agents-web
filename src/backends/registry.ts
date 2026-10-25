/**
 * Backend registry (design D3): settings-menu entries per backend id.
 * An entry is listed only when its backend is in the runtime config.
 *
 * Reserved `order` slots (lower sorts first):
 *   10 Clusters  (configuration-improvements)
 *   20 Webhooks  (agents-webhook-microservice)
 *   30 Schedules (agents-schedule-microservice)
 *   40 Presets   (orchestrator, registered below)
 */
import { createElement, type ReactNode } from 'react'
import type { RuntimeConfig } from '../config/backends'
import { ClustersPage } from '../clusters/ClustersPage'
import { PresetsPage } from '../presets/PresetsPage'

export interface MenuEntry {
  id: string
  label: string
  order: number
  backend: string
  /** `openCluster` selects a cluster and returns to the cluster view. */
  render(onBack: () => void, openCluster: (clusterId: string) => void): ReactNode
}

export const BACKEND_MENUS: Record<string, MenuEntry[]> = {
  orchestrator: [
    { id: 'clusters', label: 'Clusters', order: 10, backend: 'orchestrator', render: (onBack, openCluster) => createElement(ClustersPage, { onBack, onOpen: openCluster }) },
    { id: 'presets', label: 'Presets', order: 40, backend: 'orchestrator', render: (onBack) => createElement(PresetsPage, { onBack }) },
  ],
}

export function menuEntries(config: RuntimeConfig): MenuEntry[] {
  const entries: MenuEntry[] = []
  for (const { id } of config.backends) {
    const registered = BACKEND_MENUS[id]
    if (registered === undefined) console.warn(`backend "${id}" is configured but registers no menu entries`)
    else entries.push(...registered)
  }
  return entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}
