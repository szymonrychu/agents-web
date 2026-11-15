// @vitest-environment jsdom
import { Button } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { theme } from '../theme'
import { PageHeader } from './PageHeader'

afterEach(cleanup)

const mount = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)

test('renders the title as h1, Back and the children, and wraps', () => {
  const onBack = vi.fn()
  const { container } = mount(<PageHeader title="Schedules" onBack={onBack}><Button>New schedule</Button></PageHeader>)
  expect(screen.getByRole('heading', { level: 1, name: 'Schedules' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(onBack).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'New schedule' })).toBeTruthy()
  expect(emittedCssFor(container.firstElementChild!)).toContain('flex-wrap:wrap')
})

test('no Back button without onBack', () => {
  mount(<PageHeader title="Tasks" />)
  expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
})

test('backTo renders Back as a link and wins over onBack', () => {
  const onBack = vi.fn()
  mount(<MemoryRouter><PageHeader title="Tasks" backTo="/" onBack={onBack} /></MemoryRouter>)
  const back = screen.getByRole('link', { name: 'Back' })
  expect(back.getAttribute('href')).toBe('/')
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
})
