// @vitest-environment jsdom
import { Switch } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
