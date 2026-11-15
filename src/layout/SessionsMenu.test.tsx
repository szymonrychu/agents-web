// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { SessionsMenu } from './SessionsMenu'

afterEach(cleanup)

test('the drawer paper clears the notch, the Home Indicator and the left edge', () => {
  render(<SessionsMenu open onClose={() => {}} sessions={[]} selectedId={null} onSelect={() => {}} settingsCategories={[]} />)
  const css = emittedCssFor(document.querySelector('.MuiDrawer-paper')!)
  for (const side of ['top', 'bottom', 'left']) expect(css).toContain(`env(safe-area-inset-${side})`)
})
