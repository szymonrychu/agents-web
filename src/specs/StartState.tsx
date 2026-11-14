/** The latest autostart record of a spec, as one line under the header. */
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { STATE_TEXT, type AutostartState } from '../projects/autostartApi'
import type { Spec } from './api'

export type SpecStart = Spec['starts'][number]

const sessionLink = (id: string) => `/?session=${encodeURIComponent(id)}`

function holdText(reason: string | null): string {
  if (reason === 'autostart_off') return STATE_TEXT.off
  if (reason !== null && Object.hasOwn(STATE_TEXT, reason)) return STATE_TEXT[reason as AutostartState]
  return 'waiting'
}

function Line({ start }: { start: SpecStart }) {
  const link = (text: string) =>
    start.session_id ? <RouterLink to={sessionLink(start.session_id)}>{text}</RouterLink> : text
  switch (start.status) {
    case 'handled':
      return start.mode === 'nudged' ? link('Messaged owner session') : link(`Started session ${start.slug ?? ''}`.trimEnd())
    case 'queued':
      return `Queued #${start.position ?? '?'} in ${start.project} - ${holdText(start.hold_reason)}`
    case 'in_progress':
      return `Starting session ${start.slug ?? ''}`.trimEnd()
    case 'failed':
      return `Start failed: ${start.error ?? 'unknown error'}`
    case 'removed':
      return 'Removed from queue'
    default:
      return 'Start pending'
  }
}

export function StartState({ starts }: { starts: SpecStart[] }) {
  if (starts.length === 0) return null
  const latest = starts.reduce((a, b) => (b.ordinal > a.ordinal || (b.ordinal === a.ordinal && b.id > a.id) ? b : a))
  return (
    <Typography component="p" color="text.secondary" sx={{ m: 0 }}>
      <Line start={latest} />
    </Typography>
  )
}
