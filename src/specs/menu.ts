import { createElement } from 'react'
import { Navigate } from 'react-router'
import type { MenuEntry } from '../backends/registry'

/** Specs is a routed page: opening the settings entry navigates to it. */
export const specsMenu: MenuEntry = {
  id: 'specs',
  label: 'Specs',
  order: 39,
  backend: 'taskboard',
  render: () => createElement(Navigate, { to: '/specs' }),
}
