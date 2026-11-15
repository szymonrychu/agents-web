// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { MindmapsRoute } from './routes'

vi.mock('./MindmapsPage', () => ({ MindmapsPage: () => null }))

afterEach(cleanup)

function mount() {
  render(
    <MemoryRouter initialEntries={['/mindmaps']}>
      <Routes>
        <Route path="/mindmaps/*" element={<MindmapsRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('the mindmaps root pads every edge by the device inset', () => {
  mount()
  const css = emittedCssFor(screen.getByTestId('mindmaps-route'))
  for (const side of ['top', 'right', 'bottom', 'left']) expect(css).toContain(`env(safe-area-inset-${side})`)
})

test('the mindmaps root follows #root instead of pinning 100dvh', () => {
  mount()
  const css = emittedCssFor(screen.getByTestId('mindmaps-route'))
  expect(css).toContain('flex-grow:1')
  expect(css).toContain('min-height:0')
  expect(css).not.toContain('100dvh')
})
