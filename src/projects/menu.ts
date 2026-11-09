import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { ProjectsPage } from './ProjectsPage'

export const projectsMenu: MenuEntry = {
  id: 'projects',
  label: 'Projects',
  order: 62,
  backend: 'orchestrator',
  render: (onBack) => createElement(ProjectsPage, { onBack }),
}
