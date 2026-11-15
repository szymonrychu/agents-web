/** Shared table sx: a scroll box around every Table and the column priority on phones. */

/** Header and body cells of a low-priority column: hidden below `sm` (600 px), a normal cell above. */
export const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } } as const

/** TableContainer sx: wide tables scroll sideways inside their box instead of the page. */
export const TABLE_SCROLL_SX = { overflowX: 'auto', maxWidth: '100%' } as const

/**
 * One source of truth for a table's phone-hidden columns: build it from the labels hidden on xs, then call it with a column
 * label for the header cell and for every body cell of that column (optionally merging more sx), so the two cannot drift.
 */
export function phoneColumns(hidden: readonly string[]) {
  const set = new Set(hidden)
  return (label: string, extra?: Record<string, unknown>) => (set.has(label) ? { ...hideOnPhone, ...extra } : extra)
}
