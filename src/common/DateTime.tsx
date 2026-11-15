import { Box } from '@mui/material'
import type { JSX } from 'react'
import { formatDateTime, formatDateTimeFull } from './dates'

export interface DateTimeProps {
  iso: string | null | undefined
  timeZone?: string
  /** Text shown when `iso` is empty; default '-'. */
  fallback?: string
}

/** A timestamp as compact text in a `<time>` element that never wraps, with the full form as its title. */
export function DateTime({ iso, timeZone, fallback = '-' }: DateTimeProps): JSX.Element {
  if (!iso) return <>{fallback}</>
  return (
    <Box component="time" dateTime={iso} title={formatDateTimeFull(iso, { timeZone })} sx={{ whiteSpace: 'nowrap' }}>
      {formatDateTime(iso, { timeZone })}
    </Box>
  )
}
