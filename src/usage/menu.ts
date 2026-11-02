import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { UsagePage } from './UsagePage'

export const usageMenu: MenuEntry = {
  id: 'usage',
  label: 'Usage',
  order: 50,
  backend: 'usage',
  render: (onBack) => createElement(UsagePage, { onBack }),
}
