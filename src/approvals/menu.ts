import { createElement } from 'react'
import { Navigate } from 'react-router'
import type { MenuEntry } from '../backends/registry'

/** Approvals is a routed page: opening the settings entry navigates to it. */
export const approvalsMenu: MenuEntry = {
  id: 'approvals',
  label: 'Approvals',
  order: 44,
  backend: 'taskboard',
  render: () => createElement(Navigate, { to: '/approvals' }),
}
