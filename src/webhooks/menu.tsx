import type { MenuEntry } from '../backends/registry'
import { WebhooksPage } from './WebhooksPage'

export const webhooksMenu: MenuEntry = {
  id: 'webhooks',
  label: 'Webhooks',
  order: 20,
  backend: 'webhooks',
  render: (onBack) => <WebhooksPage onBack={onBack} />,
}
