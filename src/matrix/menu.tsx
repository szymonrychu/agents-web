import { createElement } from 'react'
import type { MenuEntry } from '../backends/registry'
import { ChatsPage } from './ChatsPage'

export const chatsMenu: MenuEntry = {
  id: 'chats',
  label: 'Chats',
  order: 35,
  backend: 'matrix',
  render: (onBack, openSession) => createElement(ChatsPage, { onBack, onOpenSession: openSession }),
}
