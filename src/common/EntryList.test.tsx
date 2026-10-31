// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import EntryList from './EntryList'

afterEach(cleanup)

function Harness({ initial, spy }: { initial: string[]; spy?: (v: string[]) => void }) {
  const [entries, setEntries] = useState(initial)
  return (
    <ThemeProvider theme={theme}>
      <EntryList
        label="Script"
        entries={entries}
        onChange={(v) => {
          spy?.(v)
          setEntries(v)
        }}
      />
    </ThemeProvider>
  )
}
const rows = () => screen.queryAllByRole('textbox').map((e) => (e as HTMLInputElement).value)

describe('EntryList', () => {
  test('renders one row per entry', () => {
    render(<Harness initial={['a', 'b']} />)
    expect(rows()).toEqual(['a', 'b'])
  })

  test('add appends an empty row', async () => {
    const spy = vi.fn()
    render(<Harness initial={['a']} spy={spy} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add script' }))
    expect(spy).toHaveBeenLastCalledWith(['a', ''])
    expect(rows()).toEqual(['a', ''])
  })

  test('remove drops that row and keeps the order of the rest', async () => {
    render(<Harness initial={['a', 'b', 'c']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove script 2' }))
    expect(rows()).toEqual(['a', 'c'])
  })

  test('editing a row changes only that entry', async () => {
    const spy = vi.fn()
    render(<Harness initial={['a', 'b']} spy={spy} />)
    await userEvent.type(screen.getByLabelText('Script 2'), 'x')
    expect(spy).toHaveBeenLastCalledWith(['a', 'bx'])
  })

  test('paste adds one entry per non-empty line, in order', async () => {
    render(<Harness initial={['a']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Paste script' }))
    await userEvent.click(screen.getByLabelText('Paste script contents'))
    await userEvent.paste('one\n\ntwo\r\nthree\n')
    await userEvent.click(screen.getByRole('button', { name: 'Apply paste' }))
    expect(rows()).toEqual(['a', 'one', 'two', 'three'])
  })

  test('rows keep their identity across a removal', async () => {
    render(<Harness initial={['a', 'b', 'c']} />)
    const third = screen.getByLabelText('Script 3')
    await userEvent.click(screen.getByRole('button', { name: 'Remove script 1' }))
    expect(screen.getByLabelText('Script 2')).toBe(third)
  })
})
