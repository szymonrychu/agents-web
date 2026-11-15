// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { setViewport } from '../test/viewport'
import { theme } from '../theme'
import { ProjectProvider } from './ProjectContext'
import { ProjectSelect } from './ProjectSelect'

const projects = vi.hoisted(() => ({ listProjects: vi.fn() }))
vi.mock('./api', () => projects)

beforeEach(() => projects.listProjects.mockResolvedValue([]))
afterEach(cleanup)

function rootCss(): string {
  render(<MemoryRouter><ProjectProvider><ThemeProvider theme={theme}><ProjectSelect /></ThemeProvider></ProjectProvider></MemoryRouter>)
  return emittedCssFor(screen.getByRole('combobox', { name: 'Project' }).closest('.MuiInputBase-root')!)
}

test('on a phone the selector shrinks to at most 40% of the bar', () => {
  setViewport(375, { coarse: true })
  const css = rootCss()
  expect(css).toContain('max-width:40%')
  expect(css).toContain('min-width:0')
})

test('on a desktop the selector keeps its 140px minimum', () => {
  setViewport(1440)
  const css = rootCss()
  expect(css).toContain('min-width:140px')
  expect(css).not.toContain('max-width:40%')
})
