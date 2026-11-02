import { createElement } from 'react'
import { Navigate } from 'react-router'
import type { MenuEntry } from '../backends/registry'

/** Tasks is a routed page: opening the settings entry navigates to it. */
export const tasksMenu: MenuEntry = {
  id: 'tasks',
  label: 'Tasks',
  order: 38,
  backend: 'taskboard',
  render: () => createElement(Navigate, { to: '/tasks' }),
}
