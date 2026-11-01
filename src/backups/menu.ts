import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { BackupsPage } from './BackupsPage'

export const backupsMenu: MenuEntry = {
  id: 'backups',
  label: 'Backups',
  order: 45,
  backend: 'orchestrator',
  render: (onBack) => createElement(BackupsPage, { onBack }),
}
