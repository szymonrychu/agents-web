import MoreVertIcon from '@mui/icons-material/MoreVert'
import { Box, Button, IconButton, Menu, MenuItem } from '@mui/material'
import { useId, useState, type JSX } from 'react'
import { useLayout } from './useLayout'

export interface RowAction {
  /** Visible text: the button text, the menu item text. */
  label: string
  onClick: () => void
  /** Accessible name, e.g. `Edit ${name}`; default the label inline and `${label} ${name}` in the menu. */
  ariaLabel?: string
  color?: 'primary' | 'error'
  disabled?: boolean
  /** Set for a disclosure toggle: aria-expanded on the button or menu item. */
  expanded?: boolean
}

export interface RowActionsProps {
  actions: readonly RowAction[]
  /** The row's name, for the accessible names of the menu button and its items. */
  name: string
  /** One kebab menu instead of inline buttons; default on phones. */
  menu?: boolean
}

/** A row's actions: inline small buttons, or on phones one 44px kebab button with a menu. */
export function RowActions({ actions, name, menu }: RowActionsProps): JSX.Element | null {
  const phone = useLayout() === 'phone'
  const menuId = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (actions.length === 0) return null
  const asMenu = menu ?? phone
  if (!asMenu) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
        {actions.map((a, i) => (
          <Button key={i} size="small" color={a.color} disabled={a.disabled} aria-label={a.ariaLabel ?? a.label} aria-expanded={a.expanded} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </Box>
    )
  }
  const open = anchor !== null
  return (
    <>
      <IconButton
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ list: { id: menuId } }}>
        {actions.map((a, i) => (
          <MenuItem
            key={i}
            disabled={a.disabled}
            aria-label={a.ariaLabel ?? `${a.label} ${name}`}
            aria-expanded={a.expanded}
            sx={a.color === 'error' ? { color: 'error.main' } : undefined}
            onClick={() => {
              setAnchor(null)
              a.onClick()
            }}
          >
            {a.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
