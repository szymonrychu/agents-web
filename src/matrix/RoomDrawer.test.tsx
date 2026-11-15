// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { RoomDrawer } from './RoomDrawer'

const never = vi.hoisted(() => () => new Promise(() => {}))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getRoom: never, listRules: never, getSettings: never, listRoomMessages: never,
}))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), listPresets: never }))

afterEach(cleanup)

test('the drawer paper clears the notch, the Home Indicator and the right edge', () => {
  render(<RoomDrawer roomId="!a" onClose={() => {}} onChanged={() => {}} />)
  const css = emittedCssFor(document.querySelector('.MuiDrawer-paper')!)
  for (const side of ['top', 'bottom', 'right']) expect(css).toContain(`env(safe-area-inset-${side})`)
})
