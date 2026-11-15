// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { SessionView } from '../api/client'
import type { SessionEntry } from '../ribbon/useSessions'
import { emittedCssFor } from '../test/emittedCss'
import { SessionsMenu } from './SessionsMenu'

afterEach(cleanup)

test('the drawer paper clears the notch, the Home Indicator and the left edge', () => {
  render(<SessionsMenu open onClose={() => {}} sessions={[]} selectedId={null} onSelect={() => {}} settingsCategories={[]} />)
  const css = emittedCssFor(document.querySelector('.MuiDrawer-paper')!)
  for (const side of ['top', 'bottom', 'left']) expect(css).toContain(`env(safe-area-inset-${side})`)
})

const entry = (id: string, slug: string, pct: number | null): SessionEntry => ({
  session: { created_at: '2026-01-01T00:00:00Z', desired: 'active', generation: 1, id, observed_generation: 1, slug, spec: {} as SessionView['spec'], status: {}, summary: { auto_compact_pct: 80, context_pct_max: pct, failed: 0, queued: 0, ready: 1, replicas: 2, state: 'working' } } as SessionView,
  agents: {},
})

test('each session shows its state mark, ready pods and context', () => {
  render(<SessionsMenu open onClose={() => {}} sessions={[entry('a', 'alpha', 45), entry('b', 'bravo', null)]} selectedId={null} onSelect={() => {}} settingsCategories={[]} />)
  const [alpha, bravo] = within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('button')
  expect(within(alpha).getByRole('img', { name: 'state working' })).toBeTruthy()
  expect(alpha.textContent).toContain('1/2')
  expect(alpha.textContent).toContain('ctx 45%')
  expect(bravo.textContent).toContain('1/2')
  expect(bravo.textContent).not.toContain('ctx')
})
