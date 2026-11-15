/** Shared table sx: a scroll box around every Table and the column priority on phones. */

/** Header and body cells of a low-priority column: hidden below `sm` (600 px), a normal cell above. */
export const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } } as const

/** TableContainer sx: wide tables scroll sideways inside their box instead of the page. */
export const TABLE_SCROLL_SX = { overflowX: 'auto', maxWidth: '100%' } as const
