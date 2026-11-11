/**
 * Backend registry (design D3): settings-menu entries per backend id.
 * An entry is listed only when its backend is in the runtime config.
 *
 * Reserved `order` slots (lower sorts first):
 *   10 Sessions  (configuration-improvements)
 *   20 Webhooks  (agents-webhook-microservice)
 *   30 Schedules (agents-schedule-microservice)
 *   35 Chats     (agents-matrix-connector)
 *   38 Tasks     (agents-taskboard, a routed page: the entry navigates to /tasks)
 *   39 Specs     (agents-taskboard, a routed page: the entry navigates to /specs)
 *   40 Presets   (orchestrator, registered below)
 *   42 Proposals (orchestrator, preset change proposals)
 *   43 Vault     (agents-vault, secret env entries)
 *   45 Backups   (orchestrator, S3 workspace archives)
 *   50 Usage (agents-usage)
 *   55 History (agents-history)
 *   60 Devices (agents-app-connector admin API)
 *   62 Projects (orchestrator, project buckets)
 */
import { createElement, type ReactNode } from 'react'
import type { RuntimeConfig } from '../config/backends'
import { SessionsPage } from '../sessions/SessionsPage'
import { webhooksMenu } from '../webhooks/menu'
import { schedulesMenu } from '../schedules/menu'
import { chatsMenu } from '../matrix/menu'
import { devicesMenu } from '../devices/menu'
import { backupsMenu } from '../backups/menu'
import { usageMenu } from '../usage/menu'
import { historyMenu } from '../history/menu'
import { tasksMenu } from '../tasks/menu'
import { specsMenu } from '../specs/menu'
import { proposalsMenu } from '../proposals/menu'
import { vaultMenu } from '../vault/menu'
import { projectsMenu } from '../projects/menu'
import { PresetsPage } from '../presets/PresetsPage'

export interface MenuEntry {
  id: string
  label: string
  order: number
  backend: string
  /** `openSession` selects a session and returns to its workspace. */
  render(onBack: () => void, openSession: (sessionId: string) => void): ReactNode
}

export const BACKEND_MENUS: Record<string, MenuEntry[]> = {
  orchestrator: [
    { id: 'sessions', label: 'Sessions', order: 10, backend: 'orchestrator', render: (onBack, openSession) => createElement(SessionsPage, { onBack, onOpen: openSession }) },
    { id: 'presets', label: 'Presets', order: 40, backend: 'orchestrator', render: (onBack) => createElement(PresetsPage, { onBack }) },
    proposalsMenu,
    backupsMenu,
    projectsMenu,
  ],
  taskboard: [tasksMenu, specsMenu],
  webhooks: [webhooksMenu],
  schedules: [schedulesMenu],
  matrix: [chatsMenu],
  devices: [devicesMenu],
  usage: [usageMenu],
  history: [historyMenu],
  vault: [vaultMenu],
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
