import { createElement } from 'react'
import { Navigate } from 'react-router'
import type { MenuEntry } from '../backends/registry'

/** Mindmaps is a routed page (lazy chunk): opening the settings entry navigates to it. */
export const mindmapMenu: MenuEntry = {
  id: 'mindmaps',
  label: 'Mindmaps',
  order: 41,
  backend: 'mindmap',
  render: () => createElement(Navigate, { to: '/mindmaps' }),
}
