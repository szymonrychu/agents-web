// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { setViewport } from '../test/viewport'
import { theme } from '../theme'
import { RowActions, type RowAction } from './RowActions'

afterEach(cleanup)

const mount = (actions: RowAction[], menu?: boolean) => render(<ThemeProvider theme={theme}><RowActions actions={actions} name="a" menu={menu} /></ThemeProvider>)

test('inline buttons on wider screens', () => {
  setViewport(1440)
  const edit = vi.fn()
  const del = vi.fn()
  mount([{ label: 'Edit', ariaLabel: 'Edit a', onClick: edit }, { label: 'Delete', color: 'error', onClick: del }])
  fireEvent.click(screen.getByRole('button', { name: 'Edit a' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.queryByRole('button', { name: 'Actions for a' })).toBeNull()
  expect(edit).toHaveBeenCalledTimes(1)
  expect(del).toHaveBeenCalledTimes(1)
})

test('one 44px menu button on phones', async () => {
  setViewport(375, { coarse: true })
  const edit = vi.fn()
  mount([{ label: 'Edit', ariaLabel: 'Edit a', onClick: edit }, { label: 'Delete', color: 'error', onClick: () => {} }])
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(1)
  const kebab = screen.getByRole('button', { name: 'Actions for a' })
  expect(kebab.getAttribute('aria-haspopup')).toBe('menu')
  expect(kebab.getAttribute('aria-expanded')).toBe('false')
  const css = emittedCssFor(kebab)
  expect(css).toContain('min-width:44px')
  expect(css).toContain('min-height:44px')
  fireEvent.click(kebab)
  const menu = screen.getByRole('menu')
  expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
  expect(kebab.getAttribute('aria-expanded')).toBe('true')
  expect(menu.id).not.toBe('')
  expect(kebab.getAttribute('aria-controls')).toBe(menu.id)
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit a' }))
  expect(edit).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
})

test('disabled and expanded carry over', () => {
  setViewport(1440)
  mount([{ label: 'Delete', disabled: true, onClick: () => {} }, { label: 'Runs', expanded: true, onClick: () => {} }])
  expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Runs' }).getAttribute('aria-expanded')).toBe('true')
  cleanup()
  mount([{ label: 'Delete', disabled: true, onClick: () => {} }, { label: 'Runs', expanded: false, onClick: () => {} }], true)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for a' }))
  expect(screen.getByRole('menuitem', { name: 'Delete a' }).getAttribute('aria-disabled')).toBe('true')
  expect(screen.getByRole('menuitem', { name: 'Runs a' }).getAttribute('aria-expanded')).toBe('false')
})

test('no actions renders nothing', () => {
  setViewport(1440)
  const { container } = mount([])
  expect(container.innerHTML).toBe('')
  cleanup()
  setViewport(375, { coarse: true })
  const phone = mount([])
  expect(phone.container.innerHTML).toBe('')
})

test('menu items carry the row name by default', () => {
  setViewport(375, { coarse: true })
  mount([{ label: 'Delete', onClick: () => {} }, { label: 'Edit', ariaLabel: 'Change a', onClick: () => {} }])
  fireEvent.click(screen.getByRole('button', { name: 'Actions for a' }))
  expect(screen.getByRole('menuitem', { name: 'Delete a' })).toBeTruthy()
  expect(screen.getByRole('menuitem', { name: 'Change a' })).toBeTruthy()
})

test('duplicate labels render every action without a key clash', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    setViewport(1440)
    mount([{ label: 'Run', onClick: () => {} }, { label: 'Run', onClick: () => {} }])
    expect(screen.getAllByRole('button', { name: 'Run' })).toHaveLength(2)
    cleanup()
    mount([{ label: 'Run', onClick: () => {} }, { label: 'Run', onClick: () => {} }], true)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for a' }))
    expect(screen.getAllByRole('menuitem', { name: 'Run a' })).toHaveLength(2)
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/)
  } finally {
    error.mockRestore()
  }
})
