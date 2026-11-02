import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { HistoryPage } from './HistoryPage'

export const historyMenu: MenuEntry = {
  id: 'history',
  label: 'History',
  order: 55,
  backend: 'history',
  render: (onBack) => createElement(HistoryPage, { onBack }),
}
