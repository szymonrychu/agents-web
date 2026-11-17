/** Rows of the spec's backup entries (root, path, mode, name template, exclude, live, after init); props only, the parent owns the state. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import TemplateEditor from '../editor/TemplateEditor'
import { previewFor } from '../sessions/previewFor'
import { BACKUP_MODES, BACKUP_ROOTS, blankBackupRow } from './backupEntries'
import type { BackupRow } from './backupEntries'

const ROOT_HELP: Record<string, string> = { workspace: 'the session workdir', claude: 'the Claude config shared by all pods of the session' }
const MODE_HELP: Record<string, string> = { backup: 'saved at discard', restore: 'restored at start', both: 'restored at start and saved at discard' }

export function BackupEntriesEditor({ rows, onChange, errors, disabled }: {
  rows: BackupRow[]
  onChange: (rows: BackupRow[]) => void
  errors?: (string | undefined)[]
  disabled?: boolean
}) {
  const patch = (index: number, p: Partial<BackupRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...p } : r)))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2" component="div">Backup entries</Typography>
      <FormHelperText>The workspace is discarded unless an entry lists it.</FormHelperText>
      {rows.map((row, i) => (
        <Box key={i} role="group" aria-label={`Backup entry ${i + 1}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField select size="small" label={`Entry ${i + 1} root`} value={row.root} onChange={(e) => patch(i, { root: e.target.value as BackupRow['root'] })} disabled={disabled} helperText={ROOT_HELP[row.root]} sx={{ flex: '1 1 10rem' }}>
              {BACKUP_ROOTS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <TextField size="small" label={`Entry ${i + 1} path`} value={row.path} onChange={(e) => patch(i, { path: e.target.value })} disabled={disabled} helperText="Relative to the root; . is the whole root" sx={{ flex: '2 1 12rem' }} />
            <TextField select size="small" label={`Entry ${i + 1} mode`} value={row.mode} onChange={(e) => patch(i, { mode: e.target.value as BackupRow['mode'] })} disabled={disabled} helperText={MODE_HELP[row.mode]} sx={{ flex: '1 1 10rem' }}>
              {BACKUP_MODES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <IconButton size="small" aria-label={`Remove entry ${i + 1}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}>x</IconButton>
          </Box>
          <TemplateEditor label={`Entry ${i + 1} name`} value={row.name} onChange={(v) => patch(i, { name: v })} preview={previewFor('archive_name')} disabled={disabled} />
          <TextField size="small" label={`Entry ${i + 1} exclude (one glob per line)`} value={row.exclude} onChange={(e) => patch(i, { exclude: e.target.value })} disabled={disabled} multiline minRows={2} fullWidth />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel control={<Switch checked={row.live} onChange={(e) => patch(i, { live: e.target.checked })} disabled={disabled} slotProps={{ input: { 'aria-label': `Entry ${i + 1} live` } }} />} label="Live" />
            <FormControlLabel control={<Switch checked={row.afterInit} onChange={(e) => patch(i, { afterInit: e.target.checked })} disabled={disabled} slotProps={{ input: { 'aria-label': `Entry ${i + 1} after init` } }} />} label="After init" />
          </Box>
          <FormHelperText>Live: a new current version of the name is delivered while the session runs; unsaved edits are never overwritten. After init: restored after the init scripts.</FormHelperText>
          {errors?.[i] && <FormHelperText error>{errors[i]}</FormHelperText>}
        </Box>
      ))}
      <Box>
        <Button size="small" disabled={disabled} onClick={() => onChange([...rows, blankBackupRow()])}>Add entry</Button>
      </Box>
    </Box>
  )
}
