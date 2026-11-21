import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { VolumesPage } from './VolumesPage'

export const volumesMenu: MenuEntry = {
  id: 'volumes',
  label: 'Volumes',
  order: 46,
  backend: 'orchestrator',
  render: (onBack) => createElement(VolumesPage, { onBack }),
}
