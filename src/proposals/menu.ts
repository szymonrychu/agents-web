import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { ProposalsPage } from './ProposalsPage'

export const proposalsMenu: MenuEntry = {
  id: 'proposals',
  label: 'Proposals',
  order: 42,
  backend: 'orchestrator',
  render: (onBack) => createElement(ProposalsPage, { onBack }),
}
