/**
 * Layout class of the viewport, built on the theme breakpoints (sm = 600, lg = 1200):
 * width < 600 is 'phone', 600..1199 is 'tablet', >= 1200 is 'desktop'. A touch device that is short in landscape
 * (height <= 500) is also a 'phone'. The only module that calls useMediaQuery for layout decisions.
 */
import { useMediaQuery, useTheme } from '@mui/material'
import { TOUCH_OR_SMALL_QUERY } from '../theme'

export type LayoutClass = 'phone' | 'tablet' | 'desktop'

/**
 * @returns the current layout class, updated when the viewport crosses a breakpoint.
 */
export function useLayout(): LayoutClass {
  const theme = useTheme()
  const isTabletUp = useMediaQuery(theme.breakpoints.up('sm'))
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const isLandscapePhone = useMediaQuery('(pointer: coarse) and (max-height: 500px)')
  if (isLandscapePhone) return 'phone'
  if (isDesktop) return 'desktop'
  return isTabletUp ? 'tablet' : 'phone'
}

/** The runtime twin of the theme's TOUCH_OR_SMALL gate: a touch device, no hover, or a window under 900 px. */
export function useTouchOrSmall(): boolean {
  return useMediaQuery(TOUCH_OR_SMALL_QUERY, { noSsr: true })
}
