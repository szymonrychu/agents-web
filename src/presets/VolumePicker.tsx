/** Volume attachments of a preset (spec.volumes): volume, mode, mount path and the backup/restore switch per row. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { VolumeView } from '../volumes/api'
import { defaultMountPath, shadowsConfig, volumeRowErrors } from './volumeRows'
import type { VolumeRow } from './volumeRows'

export interface VolumePickerProps {
  rows: VolumeRow[]
  onChange: (rows: VolumeRow[]) => void
  volumes: VolumeView[]
  /** The preset's project scope: its home project plus the extra projects. */
  scope: string[]
  /** Most attachments per preset (/meta caps volume_max_per_preset); undefined until /meta loads. */
  max?: number
  /** The preset holds a privileged grant (docker, cluster or namespace access). */
  privileged: boolean
  serverErrors?: (string | undefined)[]
}

export function VolumePicker({ rows, onChange, volumes, scope, max, privileged, serverErrors }: VolumePickerProps) {
  const byId = new Map(volumes.map((v) => [v.id, v]))
  const names = new Map(volumes.map((v) => [v.id, v.name]))
  const options = volumes.filter((v) => v.projects.some((p) => scope.includes(p)))
  const errors = volumeRowErrors(rows, names)
  const patch = (i: number, p: Partial<VolumeRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const full = max !== undefined && rows.length >= max

  return (
    <Box role="group" aria-label="Volumes" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">Volumes</Typography>
      {rows.map((row, i) => {
        const vol = byId.get(row.volume)
        const n = i + 1
        const path = row.mountPath.trim() !== '' ? row.mountPath.trim() : vol ? defaultMountPath(vol.name) : ''
        const choices = vol && !options.includes(vol) ? [vol, ...options] : options
        return (
          <Box key={i} role="group" aria-label={`Volume attachment ${n}`} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField select size="small" label={`Volume ${n}`} value={row.volume} onChange={(e) => patch(i, { volume: e.target.value })} sx={{ flex: '1 1 12rem' }} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">Pick a volume</MenuItem>
                {row.volume !== '' && !vol && <MenuItem value={row.volume}>{row.volume}</MenuItem>}
                {choices.map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
              </TextField>
              <TextField select size="small" label={`Mode ${n}`} value={row.mode} onChange={(e) => patch(i, { mode: e.target.value as 'ro' | 'rw' })} sx={{ flex: '0 1 9rem' }}>
                <MenuItem value="ro">Read only</MenuItem>
                <MenuItem value="rw">Read write</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={`Mount path ${n}`}
                value={row.mountPath}
                placeholder={vol ? defaultMountPath(vol.name) : '/volumes/<name>'}
                onChange={(e) => patch(i, { mountPath: e.target.value })}
                error={Boolean(errors?.[i] ?? serverErrors?.[i])}
                helperText={errors?.[i] ?? serverErrors?.[i] ?? (row.mountPath.trim() === '' && vol ? `Default ${defaultMountPath(vol.name)}` : undefined)}
                sx={{ flex: '1 1 14rem' }}
              />
              <Button size="small" color="error" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove volume attachment ${n}`}>Remove</Button>
            </Box>
            <FormControlLabel control={<Switch size="small" checked={row.backupRestore} onChange={(e) => patch(i, { backupRestore: e.target.checked })} />} label={`Back up and restore ${n}`} />
            {shadowsConfig(path) && <FormHelperText sx={{ color: 'warning.main' }}>This path shadows existing content of the agent's config directory</FormHelperText>}
            {vol && privileged && vol.attachments > 0 && (
              <FormHelperText sx={{ color: 'warning.main' }}>This preset is privileged and the volume is shared with other presets: files cross the trust boundary and the server may refuse the save</FormHelperText>
            )}
          </Box>
        )
      })}
      <Box>
        <Button size="small" disabled={full} onClick={() => onChange([...rows, { volume: '', mountPath: '', mode: 'ro', backupRestore: false }])}>Add volume</Button>
        {max !== undefined && <FormHelperText component="span" sx={{ ml: 1 }}>{`${rows.length} of ${max} attachments`}</FormHelperText>}
      </Box>
    </Box>
  )
}
