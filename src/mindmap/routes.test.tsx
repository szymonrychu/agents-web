// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { MindmapsRoute } from './routes'

vi.mock('./MindmapsPage', () => ({ MindmapsPage: () => null }))

afterEach(cleanup)

test('the mindmaps root pads every edge by the device inset', () => {
  render(
    <MemoryRouter initialEntries={['/mindmaps']}>
      <Routes>
        <Route path="/mindmaps/*" element={<MindmapsRoute />} />
      </Routes>
    </MemoryRouter>,
  )
  const css = emittedCssFor(screen.getByTestId('mindmaps-route'))
  for (const side of ['top', 'right', 'bottom', 'left']) expect(css).toContain(`env(safe-area-inset-${side})`)
})
