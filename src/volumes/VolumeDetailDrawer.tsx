/** Volume detail: attachments, claims, events, backup versions, save, restore, resize, edit and delete. */
import Box from '@mui/material/Box'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { DateTime } from '../common/DateTime'
import { listProjects } from '../projects/api'
import { FormError } from '../triggers'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { EXCLUDE_HINT } from './CreateVolumeDialog'
import { backupsLink, deleteVolume, getVolume, parseLines, parseSize, patchVolume, restoreVolume, saveVolume, volumeErrorText, volumeEvents } from './api'
import type { MetaCaps, VolumeDetail, VolumeEventView } from './api'

export interface VolumeDetailDrawerProps {
  volumeId: string
  caps?: MetaCaps
  onClose: () => void
  /** The list must reload: something changed or the volume is gone. */
  onChanged: () => void
}

export function VolumeDetailDrawer({ volumeId, caps, onClose, onChanged }: VolumeDetailDrawerProps) {
  const [vol, setVol] = useState<VolumeDetail>()
  const [events, setEvents] = useState<VolumeEventView[]>([])
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string>()
  const [size, setSize] = useState('')
  const [projects, setProjects] = useState<string[]>([])
  const [options, setOptions] = useState<string[]>([])
  const [exclude, setExclude] = useState('')
  const [confirm, setConfirm] = useState<{ kind: 'delete' } | { kind: 'restore'; version: string }>()

  const [tick, setTick] = useState(0)
  const load = () => setTick((t) => t + 1)
  useEffect(() => {
    let live = true
    Promise.all([getVolume(volumeId), volumeEvents(volumeId)]).then(
      ([v, ev]) => {
        if (!live) return
        setVol(v)
        setSize(v.size)
        setProjects(v.projects)
        setExclude(v.exclude.join('\n'))
        setEvents(ev.items)
        setMore(ev.next_cursor !== null)
      },
      (e: unknown) => live && setError(volumeErrorText(e)),
    )
    return () => {
      live = false
    }
  }, [volumeId, tick])
  useEffect(() => {
    listProjects().then((ps) => setOptions(ps.map((p) => p.slug)), () => setOptions([]))
  }, [])

  const act = async (fn: () => Promise<unknown>, after: 'reload' | 'close' = 'reload') => {
    setError(undefined)
    try {
      await fn()
      onChanged()
      if (after === 'close') onClose()
      else load()
    } catch (e) {
      setError(volumeErrorText(e))
      load()
    }
  }
  const loadMore = async () => {
    const last = events[events.length - 1]
    if (!last) return
    try {
      const page = await volumeEvents(volumeId, last.id)
      setEvents((prev) => [...prev, ...page.items])
      setMore(page.next_cursor !== null)
    } catch (e) {
      setError(volumeErrorText(e))
    }
  }

  const current = vol ? parseSize(vol.size) : NaN
  const wanted = parseSize(size)
  const max = caps ? parseSize(caps.volume_max_size) : NaN
  const sizeError = Number.isNaN(wanted) ? 'Use a quantity such as 10Gi' : wanted < current ? 'A volume can only grow, never shrink' : wanted > max ? `At most ${caps?.volume_max_size}` : undefined
  const mounted = (vol?.mounted ?? 0) > 0
  const restoreReason = mounted ? 'A session has this volume mounted' : undefined

  return (
    <Drawer anchor="right" open onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 }, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }, 'aria-label': 'Volume details' } as object }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="h2" sx={{ flexGrow: 1, fontWeight: 500 }}>{vol?.name ?? 'Volume'}</Typography>
        <Button onClick={onClose}>Close</Button>
      </Box>
      <FormError error={error} />
      {vol && (
        <>
          <Typography variant="body2" color="text.secondary">{vol.description}</Typography>
          <Box component="section" aria-label="Attachments">
            <Typography sx={{ fontWeight: 500 }}>Presets attaching it</Typography>
            {vol.presets.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            {vol.presets.map((p) => (
              <Typography key={p.preset_id} variant="body2">{p.preset_name}: {p.mode}, {p.mount_path}{p.backup_restore ? ', backup restore' : ''}</Typography>
            ))}
          </Box>
          <Box component="section" aria-label="Claims">
            <Typography sx={{ fontWeight: 500 }}>Mounted by sessions</Typography>
            {vol.claims.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
            {vol.claims.map((c, i) => (
              <Typography key={i} variant="body2">{c.session_slug ?? 'unknown session'}: {c.mode}</Typography>
            ))}
          </Box>
          <Box component="section" aria-label="Backup versions">
            <Typography sx={{ fontWeight: 500 }}>Backup versions</Typography>
            <Link href={backupsLink(vol.name)}>Open in Backups</Link>
            {vol.versions.map((v) => (
              <Box key={v.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}><DateTime iso={v.created_at} /> {v.origin}{v.live ? ' (live)' : ''}{v.id === vol.current_version ? ' (current)' : ''}</Typography>
                <Button size="small" aria-label={`Restore version ${v.id}`} disabled={mounted} onClick={() => setConfirm({ kind: 'restore', version: v.id })}>Restore</Button>
              </Box>
            ))}
            {restoreReason && <Typography variant="caption" color="text.secondary">Restore is disabled: {restoreReason}.</Typography>}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={() => void act(() => saveVolume(volumeId))}>Save now</Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField size="small" label="Size" value={size} onChange={(e) => setSize(e.target.value)} error={sizeError !== undefined && size !== vol.size} helperText={size !== vol.size ? sizeError : 'Grow only'} sx={{ flexGrow: 1 }} />
            <Button disabled={size === vol.size || sizeError !== undefined} onClick={() => void act(() => patchVolume(volumeId, { size }))}>Resize</Button>
          </Box>
          <Autocomplete multiple size="small" options={options} value={projects} onChange={(_, v) => setProjects(v)} renderInput={(p) => <TextField {...p} label="Projects" />} />
          <TextField size="small" label="Backup excludes" multiline minRows={2} helperText={EXCLUDE_HINT} value={exclude} onChange={(e) => setExclude(e.target.value)} />
          <Box>
            <Button disabled={projects.length === 0} onClick={() => void act(() => patchVolume(volumeId, { projects, exclude: parseLines(exclude) }))}>Save changes</Button>
          </Box>
          <Box component="section" aria-label="Events">
            <Typography sx={{ fontWeight: 500 }}>Events</Typography>
            {events.map((ev) => (
              <Typography key={ev.id} variant="body2"><DateTime iso={ev.at} /> {ev.kind} by {ev.actor}</Typography>
            ))}
            {more && <Button size="small" onClick={() => void loadMore()}>Load more events</Button>}
          </Box>
          <Box>
            <Button color="error" onClick={() => setConfirm({ kind: 'delete' })}>Delete</Button>
          </Box>
        </>
      )}
      <ConfirmDialog
        open={confirm !== undefined}
        title={confirm?.kind === 'restore' ? `Restore version ${confirm.version}?` : `Delete ${vol?.name ?? 'volume'}?`}
        body={confirm?.kind === 'restore' ? `The volume data is replaced by backup version ${confirm.version}.` : 'The volume data (PVC) is removed. The S3 backups are kept.'}
        confirmLabel={confirm?.kind === 'restore' ? 'Restore' : 'Delete'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => {
          const c = confirm
          setConfirm(undefined)
          if (c?.kind === 'restore') void act(() => restoreVolume(volumeId, c.version))
          else if (c?.kind === 'delete') void act(() => deleteVolume(volumeId), 'close')
        }}
      />
    </Drawer>
  )
}
