// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SpecsRoute, specPath } from './routes'

// The pages need the taskboard backend config and have their own tests; here only the routing is under test.
vi.mock('./SpecsPage', () => ({ SpecsPage: () => null }))
vi.mock('./SpecPage', () => ({ SpecPage: () => null }))
vi.mock('./DocumentPage', () => ({ DocumentPage: () => null }))

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/specs/*" element={<SpecsRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('specs routes', () => {
  test('specPath builds the deep link', () => {
    expect(specPath('S-5')).toBe('/specs/S-5')
  })

  test('/specs renders the list route', () => {
    at('/specs')
    expect(screen.getByTestId('specs-list-route')).toBeTruthy()
  })

  test('/specs/S-5 renders the spec route with the key', () => {
    at('/specs/S-5')
    expect(screen.getByTestId('spec-route').getAttribute('data-key')).toBe('S-5')
  })

  test('/specs/S-5/doc/research/a.md renders the document route with the full path', () => {
    at('/specs/S-5/doc/research/a.md')
    const el = screen.getByTestId('doc-route')
    expect(el.getAttribute('data-key')).toBe('S-5')
    expect(el.getAttribute('data-path')).toBe('research/a.md')
  })

  test('unknown /specs/x/y shows not found', () => {
    at('/specs/x/y')
    expect(screen.getByTestId('specs-not-found')).toBeTruthy()
  })
})
