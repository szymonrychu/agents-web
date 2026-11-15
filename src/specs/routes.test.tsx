// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { SpecsRoute, specPath } from './routes'

// The pages need the taskboard backend config and have their own tests; here only the routing is under test.
vi.mock('./SpecsPage', () => ({ SpecsPage: () => null }))
// The mocks stamp each mount with a number so a test can tell a remount from a reused instance.
const mounts = vi.hoisted(() => ({ n: 0 }))
vi.mock('./SpecPage', async () => {
  const { useState } = await import('react')
  return { SpecPage: () => <span data-testid="spec-page" data-mount={useState(() => ++mounts.n)[0]} /> }
})
vi.mock('./DocumentPage', async () => {
  const { useState } = await import('react')
  return { DocumentPage: () => <span data-testid="doc-page" data-mount={useState(() => ++mounts.n)[0]} /> }
})

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

  test('the list root follows #root instead of pinning 100dvh', () => {
    at('/specs')
    const css = emittedCssFor(screen.getByTestId('specs-list-route'))
    expect(css).toContain('flex-grow:1')
    expect(css).toContain('min-height:0')
    expect(css).not.toContain('100dvh')
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

  test('navigating to another spec or document remounts the page so per-page state resets', async () => {
    render(
      <MemoryRouter initialEntries={['/specs/S-1']}>
        <Link to="/specs/S-2">next</Link>
        <Link to="/specs/S-2/doc/a.md">doc</Link>
        <Link to="/specs/S-2/doc/b.md">doc2</Link>
        <Routes>
          <Route path="/specs/*" element={<SpecsRoute />} />
        </Routes>
      </MemoryRouter>,
    )
    const mount = (id: string) => screen.getByTestId(id).getAttribute('data-mount')
    const first = mount('spec-page')
    fireEvent.click(screen.getByText('next'))
    expect(mount('spec-page')).not.toBe(first)
    fireEvent.click(screen.getByText('doc'))
    const a = mount('doc-page')
    fireEvent.click(screen.getByText('doc2'))
    expect(mount('doc-page')).not.toBe(a)
  })
})

describe('specs routes safe areas', () => {
  test.each([['/specs', 'specs-list-route'], ['/specs/S-5', 'spec-route'], ['/specs/S-5/doc/plan.md', 'doc-route']])('%s root pads every edge by the device inset', (path, id) => {
    at(path)
    const css = emittedCssFor(screen.getByTestId(id))
    for (const side of ['top', 'right', 'bottom', 'left']) expect(css).toContain(`env(safe-area-inset-${side})`)
  })
})
