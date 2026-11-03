import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { DevicesPage } from './DevicesPage'

export const devicesMenu: MenuEntry = {
  id: 'devices',
  label: 'Devices',
  order: 60,
  backend: 'devices',
  render: (onBack) => createElement(DevicesPage, { onBack }),
}
