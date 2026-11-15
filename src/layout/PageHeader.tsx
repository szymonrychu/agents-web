import { Box, Button, Typography } from '@mui/material'
import type { JSX, ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { TOKENS } from '../theme'

export interface PageHeaderProps {
  title: string
  onBack?: () => void
  /** Link target of Back; wins over onBack. */
  backTo?: string
  /** Page actions, kept together at the end of the row and wrapping below the title when space runs out. */
  children?: ReactNode
}

/** The header row of a page: optional Back, the h1 title, then the page actions; wraps on narrow screens. */
export function PageHeader({ title, onBack, backTo, children }: PageHeaderProps): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {backTo ? <Button component={RouterLink} to={backTo}>Back</Button> : onBack && <Button onClick={onBack}>Back</Button>}
      <Typography component="h1" sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: TOKENS.fontSizes.lg }}>
        {title}
      </Typography>
      {children && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', ml: 'auto' }}>{children}</Box>}
    </Box>
  )
}
