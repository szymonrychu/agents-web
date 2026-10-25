import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { SchedulesPage } from './SchedulesPage'

export const schedulesMenu: MenuEntry = {
  id: 'schedules',
  label: 'Schedules',
  order: 30,
  backend: 'schedules',
  render: (onBack, openSession) => createElement(SchedulesPage, { onBack, onOpenSession: openSession }),
}
