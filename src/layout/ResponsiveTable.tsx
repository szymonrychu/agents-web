import { Box, ButtonBase, List, ListItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, type TableRowProps } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Fragment, type JSX, type ReactNode } from 'react'
import { RowActions, type RowAction } from './RowActions'
import { TABLE_SCROLL_SX } from './tables'
import { useLayout } from './useLayout'

/** Where a column's value goes on a phone card; 'none' = table only (the value is reachable elsewhere). */
export type ColumnRole = 'primary' | 'secondary' | 'meta' | 'control' | 'none'

export interface Column<T> {
  key: string
  /** Header text; the visible field name of a 'meta' value on a card. */
  label: string
  role: ColumnRole
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
  /** Header and body cell, table mode only. */
  sx?: SxProps<Theme>
}

export interface ResponsiveTableProps<T> {
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T) => string
  /** `<table aria-label>` and `<ul aria-label>`. */
  ariaLabel: string
  /** `<article aria-label>` and the RowActions name. */
  cardLabel: (row: T) => string
  /** Last column (empty header) in a table, the header kebab on a card. */
  actions?: (row: T) => RowAction[]
  /** Expansion: a full-width row under the table row, the bottom of the card; nullish renders nothing. */
  below?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  /** DOM id on the `<tr>` and on the `<article>` (scroll targets like run-<id>). */
  rowId?: (row: T) => string
  /** Table mode only (drag and drop). */
  rowProps?: (row: T) => Omit<TableRowProps, 'children'>
  /** Rendered instead of the table or list when rows is empty. */
  empty?: ReactNode
  size?: 'small' | 'medium'
}

const present = (node: ReactNode): boolean => node !== null && node !== undefined && node !== false

/** A table above the phone breakpoint and one card per row on phones: one DOM tree, chosen in JS. */
export function ResponsiveTable<T>(props: ResponsiveTableProps<T>): JSX.Element {
  const phone = useLayout() === 'phone'
  if (props.rows.length === 0 && present(props.empty)) return <>{props.empty}</>
  return phone ? <Cards {...props} /> : <RowsTable {...props} />
}

function RowsTable<T>({ rows, columns, rowKey, ariaLabel, cardLabel, actions, below, onRowClick, rowId, rowProps, size = 'small' }: ResponsiveTableProps<T>): JSX.Element {
  const span = columns.length + (actions ? 1 : 0)
  return (
    <TableContainer sx={{ ...TABLE_SCROLL_SX, flexShrink: 0 }}>
      <Table size={size} aria-label={ariaLabel}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key} align={c.align} sx={c.sx}>{c.label}</TableCell>
            ))}
            {actions && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const extra = below?.(row)
            return (
              <Fragment key={rowKey(row)}>
                <TableRow
                  id={rowId?.(row)}
                  {...rowProps?.(row)}
                  {...(onRowClick && { hover: true, onClick: () => onRowClick(row), sx: { cursor: 'pointer' } })}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align} sx={c.sx}>{c.render(row)}</TableCell>
                  ))}
                  {actions && (
                    <TableCell align="right">
                      <RowActions actions={actions(row)} name={cardLabel(row)} menu={false} />
                    </TableCell>
                  )}
                </TableRow>
                {present(extra) && (
                  <TableRow>
                    <TableCell colSpan={span}>{extra}</TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

const PRIMARY_SX = { flex: 1, minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' } as const

function Cards<T>({ rows, columns, rowKey, ariaLabel, cardLabel, actions, below, onRowClick, rowId }: ResponsiveTableProps<T>): JSX.Element {
  const of = (role: ColumnRole) => columns.filter((c) => c.role === role)
  const primary = of('primary')
  const controls = of('control')
  const secondary = of('secondary')
  const meta = of('meta')
  return (
    <List aria-label={ariaLabel} disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
      {rows.map((row) => {
        const label = cardLabel(row)
        const extra = below?.(row)
        const title = primary.map((c) => <Box key={c.key}>{c.render(row)}</Box>)
        return (
          <ListItem key={rowKey(row)} disableGutters disablePadding>
            <Paper component="article" variant="outlined" aria-label={label} id={rowId?.(row)} sx={{ p: 2, width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {onRowClick ? (
                  <ButtonBase aria-label={`Open ${label}`} onClick={() => onRowClick(row)} sx={{ ...PRIMARY_SX, display: 'block', textAlign: 'left' }}>
                    {title}
                  </ButtonBase>
                ) : (
                  <Box sx={PRIMARY_SX}>{title}</Box>
                )}
                {controls.map((c) => (
                  <Box key={c.key} sx={{ flexShrink: 0 }}>{c.render(row)}</Box>
                ))}
                {actions && <RowActions actions={actions(row)} name={label} menu />}
              </Box>
              {secondary.map((c) => (
                <Typography key={c.key} component="div" variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {c.render(row)}
                </Typography>
              ))}
              {meta.length > 0 && (
                <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', rowGap: 0.5, columnGap: 1, m: 0 }}>
                  {meta.map((c) => (
                    <Fragment key={c.key}>
                      <Typography component="dt" variant="body2" color="text.secondary">{c.label}</Typography>
                      <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{c.render(row)}</Typography>
                    </Fragment>
                  ))}
                </Box>
              )}
              {present(extra) && <Box sx={{ minWidth: 0 }}>{extra}</Box>}
            </Paper>
          </ListItem>
        )
      })}
    </List>
  )
}
