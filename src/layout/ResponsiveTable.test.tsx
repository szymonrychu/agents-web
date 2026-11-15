// @vitest-environment jsdom
import { Switch } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { emittedCssFor } from '../test/emittedCss'
import { setViewport } from '../test/viewport'
import { theme } from '../theme'
import { ResponsiveTable, type Column, type ResponsiveTableProps } from './ResponsiveTable'

afterEach(cleanup)

interface Row { id: string; name: string; status: string; note: string }

const ROWS: Row[] = [
  { id: 'r1', name: 'alpha', status: 'active', note: 'first note' },
  { id: 'r2', name: 'beta', status: 'paused', note: 'second note' },
]

const COLUMNS: Column<Row>[] = [
  { key: 'name', label: 'Name', role: 'primary', render: (r) => r.name },
  { key: 'status', label: 'Status', role: 'meta', render: (r) => r.status },
  { key: 'note', label: 'Note', role: 'secondary', render: (r) => r.note },
  { key: 'extra', label: 'Extra', role: 'none', render: (r) => `extra-${r.id}` },
  { key: 'enabled', label: 'Enabled', role: 'control', render: (r) => <Switch size="small" slotProps={{ input: { 'aria-label': `Enabled ${r.name}` } }} /> },
]

type Props = Partial<ResponsiveTableProps<Row>>

function mount(props: Props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ResponsiveTable<Row>
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        ariaLabel="Things"
        cardLabel={(r) => `Thing ${r.name}`}
        actions={(r) => [{ label: 'Edit', ariaLabel: `Edit ${r.name}`, onClick: () => {} }]}
        {...props}
      />
    </ThemeProvider>,
  )
}

const desktop = () => setViewport(1440)
const phone = () => setViewport(375, { coarse: true })

test('renders a table with every column above the phone breakpoint', () => {
  desktop()
  mount()
  const table = screen.getByRole('table', { name: 'Things' })
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)
  expect(headers).toEqual(['Name', 'Status', 'Note', 'Extra', 'Enabled', ''])
  expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Edit alpha' })).toBeTruthy()
  expect(screen.getByText('extra-r1')).toBeTruthy()
  expect(screen.queryByRole('article')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Actions for Thing alpha' })).toBeNull()
})

test('renders one card per row on phones', () => {
  phone()
  mount()
  expect(screen.queryByRole('table')).toBeNull()
  const list = screen.getByRole('list', { name: 'Things' })
  const cards = within(list).getAllByRole('article')
  expect(cards).toHaveLength(2)
  expect(screen.getByRole('article', { name: 'Thing alpha' })).toBe(cards[0])
  expect(screen.getByRole('article', { name: 'Thing beta' })).toBe(cards[1])
  const card = within(cards[0])
  expect(card.getByText('alpha')).toBeTruthy()
  const dt = card.getByText('Status')
  expect(dt.tagName).toBe('DT')
  expect(dt.nextElementSibling?.tagName).toBe('DD')
  expect(dt.nextElementSibling?.textContent).toBe('active')
  expect(card.getByText('first note')).toBeTruthy()
  expect(card.getByRole('switch', { name: 'Enabled alpha' })).toBeTruthy()
  expect(card.getByRole('button', { name: 'Actions for Thing alpha' })).toBeTruthy()
  expect(screen.queryByText('extra-r1')).toBeNull()
  expect(screen.queryByText('Extra')).toBeNull()
})

test('below renders under the row and inside the card', () => {
  desktop()
  mount({ below: (r) => (r.id === 'r1' ? <span>runs of {r.name}</span> : null) })
  const cell = screen.getByText('runs of alpha').closest('td')!
  expect(cell.getAttribute('colSpan')).toBe(String(COLUMNS.length + 1))
  expect(cell.closest('tr')?.previousElementSibling?.textContent).toContain('alpha')
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(3)
  cleanup()
  phone()
  mount({ below: (r) => (r.id === 'r1' ? <span>runs of {r.name}</span> : null) })
  expect(within(screen.getByRole('article', { name: 'Thing alpha' })).getByText('runs of alpha')).toBeTruthy()
  expect(within(screen.getByRole('article', { name: 'Thing beta' })).queryByText(/runs of/)).toBeNull()
})

test('rowId lands on the tr and on the article', () => {
  desktop()
  const { container } = mount({ rowId: (r) => `run-${r.id}` })
  expect(container.querySelector('#run-r1')?.tagName).toBe('TR')
  cleanup()
  phone()
  const cards = mount({ rowId: (r) => `run-${r.id}` })
  expect(cards.container.querySelector('#run-r2')).toBe(screen.getByRole('article', { name: 'Thing beta' }))
})

test("onRowClick fires from the table row and from the card's open button", () => {
  desktop()
  const onRowClick = vi.fn()
  mount({ onRowClick })
  fireEvent.click(screen.getByText('beta'))
  expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1])
  cleanup()
  phone()
  const onCard = vi.fn()
  mount({ onRowClick: onCard })
  fireEvent.click(screen.getByRole('button', { name: 'Open Thing alpha' }))
  expect(onCard).toHaveBeenCalledWith(ROWS[0])
})

test('empty replaces the table and the list', () => {
  desktop()
  mount({ rows: [], empty: <p>Nothing yet</p> })
  expect(screen.getByText('Nothing yet')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
  cleanup()
  phone()
  mount({ rows: [], empty: <p>Nothing yet</p> })
  expect(screen.getByText('Nothing yet')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
})

test('the container does not shrink in a flex column', () => {
  desktop()
  const { container } = mount()
  expect(emittedCssFor(container.querySelector('.MuiTableContainer-root')!)).toContain('flex-shrink:0')
  cleanup()
  phone()
  mount()
  expect(emittedCssFor(screen.getByRole('list', { name: 'Things' }))).toContain('flex-shrink:0')
})

test('inline actions and controls in a clickable row do not open the row', () => {
  desktop()
  const onRowClick = vi.fn()
  const edit = vi.fn()
  mount({ onRowClick, actions: (r) => [{ label: 'Edit', ariaLabel: `Edit ${r.name}`, onClick: edit }] })
  fireEvent.click(screen.getByRole('button', { name: 'Edit alpha' }))
  expect(edit).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('switch', { name: 'Enabled alpha' }))
  fireEvent.keyDown(screen.getByRole('button', { name: 'Edit alpha' }), { key: 'Enter' })
  expect(onRowClick).not.toHaveBeenCalled()
})

test('a clickable table row is reachable and opened by the keyboard', () => {
  desktop()
  const onRowClick = vi.fn()
  mount({ onRowClick })
  const row = screen.getByText('beta').closest('tr')!
  expect(row.tabIndex).toBe(0)
  fireEvent.keyDown(row, { key: 'Enter' })
  expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1])
  fireEvent.keyDown(row, { key: ' ' })
  expect(onRowClick).toHaveBeenCalledTimes(2)
  fireEvent.keyDown(row, { key: 'a' })
  expect(onRowClick).toHaveBeenCalledTimes(2)
})

test('rowProps sx and handlers survive onRowClick', () => {
  desktop()
  const onRowClick = vi.fn()
  const onKeyDown = vi.fn()
  mount({ onRowClick, rowProps: () => ({ sx: { opacity: 0.5 }, onKeyDown }) })
  const row = screen.getByText('alpha').closest('tr')!
  const css = emittedCssFor(row)
  expect(css).toContain('opacity:0.5')
  expect(css).toContain('cursor:pointer')
  fireEvent.keyDown(row, { key: 'Enter' })
  expect(onKeyDown).toHaveBeenCalledTimes(1)
  expect(onRowClick).toHaveBeenCalledTimes(1)
})

function Page() {
  const [open, setOpen] = useState<string[]>([])
  return (
    <ThemeProvider theme={theme}>
      <ResponsiveTable<Row>
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        ariaLabel="Things"
        cardLabel={(r) => `Thing ${r.name}`}
        actions={(r) => [{ label: 'Runs', expanded: open.includes(r.id), onClick: () => setOpen((o) => [...o, r.id]) }]}
        below={(r) => (open.includes(r.id) ? <span>runs of {r.name}</span> : null)}
      />
    </ThemeProvider>
  )
}

test('crossing 600px with an open menu keeps page state and leaves no orphaned menu', async () => {
  phone()
  const { rerender } = render(<Page />)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Thing alpha' }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Runs Thing alpha' }))
  expect(within(screen.getByRole('article', { name: 'Thing alpha' })).getByText('runs of alpha')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Thing beta' }))
  expect(screen.getByRole('menu')).toBeTruthy()
  desktop()
  rerender(<Page />)
  expect(screen.getByRole('table', { name: 'Things' })).toBeTruthy()
  expect(screen.queryByRole('article')).toBeNull()
  expect(screen.getByText('runs of alpha').closest('td')).toBeTruthy()
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  expect(document.querySelector('.MuiPopover-root, .MuiMenu-root')).toBeNull()
  phone()
  rerender(<Page />)
  expect(within(screen.getByRole('article', { name: 'Thing alpha' })).getByText('runs of alpha')).toBeTruthy()
  expect(screen.queryByRole('menu')).toBeNull()
})

test('a long unbroken value wraps inside the card', () => {
  phone()
  const long = 'x'.repeat(300)
  mount({ rows: [{ id: 'r1', name: long, status: long, note: long }] })
  const card = screen.getByRole('article', { name: `Thing ${long}` })
  expect(emittedCssFor(card)).toContain('min-width:0')
  const [primary, secondary] = within(card).getAllByText(long).map((el) => el.closest('.MuiBox-root, .MuiTypography-root')!)
  const dd = card.querySelector('dd')!
  const dt = card.querySelector('dt')!
  for (const el of [primary.parentElement!, secondary, dd, dt]) expect(emittedCssFor(el)).toContain('overflow-wrap:anywhere')
  expect(emittedCssFor(dd)).toContain('min-width:0')
  expect(emittedCssFor(card.querySelector('dl')!)).toContain('grid-template-columns:fit-content(40%) minmax(0, 1fr)')
})

test('the Open button holds only phrasing content', () => {
  phone()
  mount({ onRowClick: () => {} })
  const open = screen.getByRole('button', { name: 'Open Thing alpha' })
  expect(open.querySelector('div')).toBeNull()
})

test('Tab reaches the open button, the control and the kebab of a card', async () => {
  phone()
  mount({ onRowClick: () => {} })
  const user = userEvent.setup()
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Thing alpha' }))
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Enabled alpha' }))
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for Thing alpha' }))
})

test('the card Open button shows a visible keyboard focus', () => {
  phone()
  mount({ onRowClick: () => {} })
  const open = screen.getByRole('button', { name: 'Open Thing alpha' })
  expect(open.className).toContain('MuiButtonBase-root')
  expect(emittedCssFor(open)).toContain('.Mui-focusVisible')
  expect(emittedCssFor(open)).toContain('outline:2px solid')
})

test('a card skips a secondary line with no value', () => {
  phone()
  mount({ rows: [{ id: 'r1', name: 'solo', status: 'ok', note: '' }] })
  const card = screen.getByRole('article', { name: 'Thing solo' })
  expect(card.children.length).toBe(2)
})
