import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { VaultPage } from './VaultPage'

export const vaultMenu: MenuEntry = {
  id: 'vault',
  label: 'Vault',
  order: 43,
  backend: 'vault',
  render: (onBack) => createElement(VaultPage, { onBack }),
}
