/** The backups a preset's entries name: literal names link to the filtered Backups page, templated names show the template (decision 762). */
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import type { BackupEntry } from '../backups/backupEntries'

/** Settings pages are state, not routes: `?view=` opens the Backups page, `name` is its initial filter. */
export const backupsLink = (name: string): string => `/?view=backups&name=${encodeURIComponent(name)}`

const isTemplate = (name: string): boolean => name.includes('{{') || name.includes('{%')

export function PresetBackupsPanel({ entries }: { entries: readonly BackupEntry[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="subtitle2" component="div">Backups of this preset</Typography>
      {entries.length === 0 && <Typography variant="body2">This preset has no backup entries.</Typography>}
      {entries.length > 0 && (
      <Box component="ul" aria-label="Backups of this preset" sx={{ m: 0, pl: 3 }}>
        {entries.map((e, i) => (
          <li key={i}>
            {isTemplate(e.name) ? (
              <>
                <Typography component="span" variant="body2">{e.name}</Typography>
                <Chip size="small" label="template" sx={{ ml: 1 }} />
              </>
            ) : (
              <Link href={backupsLink(e.name)}>{e.name}</Link>
            )}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{`${e.root}:${e.path}, ${e.mode}`}</Typography>
          </li>
        ))}
      </Box>
      )}
    </Box>
  )
}
