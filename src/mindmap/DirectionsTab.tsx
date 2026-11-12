/** Directions of one map in every state, with origin, trail and withdraw. */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { DIRECTION_STATUSES, listDirections, patchDirection } from './api'
import type { DirectionStatus, DirectionView } from './api'

export interface DirectionsTabProps {
  mapKey: string
  refreshKey: number
  /** Direction key from `?direction=`, marked in the list. */
  selected?: string | null
  onOpenNode: (key: string) => void
  onChanged: () => void
}

const when = (t: string | null) => (t ? ` ${new Date(t).toLocaleString()}` : '')

export function DirectionsTab({ mapKey, refreshKey, selected, onOpenNode, onChanged }: DirectionsTabProps) {
  const [status, setStatus] = useState<DirectionStatus | ''>('')
  const [items, setItems] = useState<DirectionView[]>()
  const [error, setError] = useState<unknown>()
  const [reloads, setReloads] = useState(0)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    let live = true
    listDirections({ map: mapKey, ...(status ? { status } : {}) }).then(
      (d) => { if (live) setItems(d) },
      (e: unknown) => { if (live) setError(e) },
    )
    return () => { live = false }
  }, [mapKey, status, refreshKey, reloads])

  const withdraw = async (d: DirectionView) => {
    setBusy(true)
    setError(undefined)
    try {
      await patchDirection(d.key, { version: d.version, action: 'withdraw' })
      reload()
      onChanged()
    } catch (e) {
      setError(e)
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1} sx={{ p: 1, overflow: 'auto' }}>
      <TextField select size="small" label="State" value={status} onChange={(e) => setStatus(e.target.value as DirectionStatus | '')} sx={{ maxWidth: 200 }}>
        <MenuItem value="">all</MenuItem>
        {DIRECTION_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>
      <FormError error={error instanceof Error ? error : undefined} />
      {items?.length === 0 && <Typography color="text.secondary">No directions</Typography>}
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {(items ?? []).map((d) => (
          <Box
            key={d.key}
            component="li"
            data-testid={`direction-${d.key}`}
            aria-current={d.key === selected ? 'true' : undefined}
            sx={{ border: 1, borderColor: d.key === selected ? 'primary.main' : 'divider', borderRadius: 1, p: 1 }}
          >
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 500, fontSize: TOKENS.fontSizes.sm }}>{d.key}</Typography>
              <Chip size="small" label={d.status} />
              <Chip size="small" variant="outlined" label={d.origin} />
              {d.node && <Button size="small" sx={{ minWidth: 0 }} onClick={() => onOpenNode(d.node as string)}>{d.node}</Button>}
              {(d.status === 'open' || d.status === 'acknowledged') && (
                <Button size="small" color="error" disabled={busy} aria-label={`Withdraw ${d.key}`} onClick={() => void withdraw(d)}>Withdraw</Button>
              )}
            </Stack>
            <Typography sx={{ fontSize: TOKENS.fontSizes.sm, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{d.text}</Typography>
            {d.growth_areas.length > 0 && <Typography variant="caption" color="text.secondary">{`Seeds: ${d.growth_areas.join('; ')}`}</Typography>}
            <Typography variant="caption" color="text.secondary" component="div">{`created by ${d.created_by}${when(d.created_at)}`}</Typography>
            {d.acknowledged_by && <Typography variant="caption" color="text.secondary" component="div">{`acknowledged by ${d.acknowledged_by}${when(d.acknowledged_at)}`}</Typography>}
            {d.resolved_by && <Typography variant="caption" color="text.secondary" component="div">{`resolved by ${d.resolved_by}${when(d.resolved_at)}`}</Typography>}
            {d.resolution !== '' && <Typography variant="caption" component="div" sx={{ wordBreak: 'break-word' }}>{`Resolution: ${d.resolution}`}</Typography>}
          </Box>
        ))}
      </Stack>
    </Stack>
  )
}
