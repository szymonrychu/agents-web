import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import { getEntry, listEvents, listPins } from './api'
import type { EntryDetail, EventView, PinView } from './api'

/** Detail of one entry: envs, attachments per env, pins and recent events. Reloads when `refresh` changes. */
export function DetailPanel({ entryId, refresh, onClose }: { entryId: string; refresh: number; onClose: () => void }) {
  const [detail, setDetail] = useState<EntryDetail>()
  const [pins, setPins] = useState<PinView[]>([])
  const [events, setEvents] = useState<EventView[]>([])
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let live = true
    Promise.all([getEntry(entryId), listPins(entryId), listEvents(entryId)])
      .then(([d, p, ev]) => {
        if (!live) return
        setDetail(d)
        setPins(p)
        setEvents(ev)
      })
      .catch((e: unknown) => live && setError(e))
    return () => {
      live = false
    }
  }, [entryId, refresh])

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }} aria-label="Entry detail" role="region">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="h2" sx={{ flexGrow: 1 }}>{detail ? `${detail.name} (v${detail.version})` : 'Entry'}</Typography>
        <Button onClick={onClose}>Close</Button>
      </Box>
      <FormError error={error instanceof Error ? error : undefined} />
      {detail && (
        <>
          <Typography variant="subtitle2">Envs</Typography>
          {detail.envs.map((e) => {
            const att = (detail.attachments ?? []).filter((a) => a.entry_env === e.env)
            return (
              <Box key={e.env} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <code>{e.env}</code>
                <span>{e.protected ? `set, v${detail.version}` : e.value}</span>
                {att.map((a) => (
                  <Chip key={`${a.preset_id}/${a.env}`} size="small" label={`${a.preset_name} as ${a.env}`} color={a.matches ? 'default' : 'warning'} />
                ))}
              </Box>
            )
          })}
          <Typography variant="subtitle2">Pins ({pins.length})</Typography>
          {pins.length === 0 && <Typography variant="body2" color="text.secondary">No session pins.</Typography>}
          {pins.map((p) => (
            <Typography key={`${p.session_id}/${p.env}`} variant="body2">
              session {p.session_id}: {p.entry_env} as {p.env}, v{p.version}
            </Typography>
          ))}
          <Typography variant="subtitle2">Recent events</Typography>
          {events.length === 0 && <Typography variant="body2" color="text.secondary">No events.</Typography>}
          {events.map((ev) => (
            <Typography key={ev.id} variant="body2">{new Date(ev.ts).toLocaleString()} {ev.kind} by {ev.actor}</Typography>
          ))}
        </>
      )}
    </Paper>
  )
}
