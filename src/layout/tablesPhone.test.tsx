// @vitest-environment jsdom
import Table from '@mui/material/Table'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { phoneColumnProblems } from '../test/emittedCss'
import { theme } from '../theme'
import { hideOnPhone, TABLE_SCROLL_SX } from './tables'

afterEach(cleanup)

const mount = (wrapped: boolean) => {
  const table = (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Keep</TableCell>
          <TableCell sx={hideOnPhone}>Drop</TableCell>
        </TableRow>
      </TableHead>
    </Table>
  )
  return render(<ThemeProvider theme={theme}>{wrapped ? <TableContainer sx={TABLE_SCROLL_SX}>{table}</TableContainer> : table}</ThemeProvider>)
}

it('phoneColumnProblems accepts a scroll box with the right columns hidden', () => {
  const { container } = mount(true)
  expect(phoneColumnProblems(container.querySelector('table')!, ['Drop'], ['Keep'])).toEqual([])
})

it('phoneColumnProblems reports a missing container and wrong columns', () => {
  const { container } = mount(false)
  const problems = phoneColumnProblems(container.querySelector('table')!, ['Keep'], ['Drop'])
  expect(problems).toEqual(['table is not inside a TableContainer', 'header Keep is not hidden on phones', 'header Drop is hidden on phones'])
})
