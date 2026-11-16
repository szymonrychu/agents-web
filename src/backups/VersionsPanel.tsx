/** The versions of one backup name: time, size, session slug, origin and state, with download, copy and delete. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { downloadUrl, listVersions } from '../api/backups'
import type { BackupVersionView } from '../api/backups'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'
import { formatBytes } from './format'

export interface VersionsPanelProps {
  name: string
  /** Versions the name has in all; the current one cannot be deleted while another exists. */
  versionCount: number
  onCopy: (version: BackupVersionView) => void
  onMakeCurrent: (version: BackupVersionView) => void
  onDelete: (version: BackupVersionView) => void
}

export function VersionsPanel({ name, versionCount, onCopy, onMakeCurrent, onDelete }: VersionsPanelProps) {
  const [items, setItems] = useState<BackupVersionView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<FormErrorValue>(null)

  useEffect(() => {
    let cancelled = false
    listVersions(name, undefined).then(
      (page) => {
        if (cancelled) return
        setItems(page.items)
        setCursor(page.next_cursor)
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [name])

  const loadMore = async () => {
    try {
      const page = await listVersions(name, cursor)
      setItems((prev) => [...(prev ?? []), ...page.items])
      setCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    }
  }

  const columns: Column<BackupVersionView>[] = [
    { key: 'saved', label: 'Saved', role: 'primary', render: (v) => <DateTime iso={v.saved_at} /> },
    { key: 'size', label: 'Size', role: 'meta', align: 'right', render: (v) => formatBytes(v.size) },
    { key: 'slug', label: 'Saved by', role: 'meta', render: (v) => v.session_slug ?? '-' },
    { key: 'origin', label: 'Origin', role: 'meta', render: (v) => v.origin },
    { key: 'state', label: 'State', role: 'meta', render: (v) => v.state },
    {
      key: 'download', label: 'Download', role: 'control',
      render: (v) => (
        <Link href={downloadUrl(name, v.id)} download aria-label={`Download version ${v.id}`} sx={{ display: 'inline-flex', alignItems: 'center', '@media (pointer: coarse)': { minHeight: 44 } }}>Download</Link>
      ),
    },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormError error={error} />
      {items === null ? (
        !error && <Typography color="text.secondary">Loading</Typography>
      ) : (
        <ResponsiveTable
          rows={items}
          columns={columns}
          rowKey={(v) => v.id}
          ariaLabel={`Versions of ${name}`}
          cardLabel={(v) => `Version ${v.id}`}
          size="small"
          actions={(v) => [
            { label: 'Copy to...', ariaLabel: `Copy version ${v.id} to`, onClick: () => onCopy(v) },
            ...(v.current ? [] : [{ label: 'Make current', ariaLabel: `Make version ${v.id} current`, onClick: () => onMakeCurrent(v) }]),
            { label: 'Delete', ariaLabel: `Delete version ${v.id}`, color: 'error' as const, disabled: v.current && versionCount > 1, onClick: () => onDelete(v) },
          ]}
        />
      )}
      {cursor !== null && <Button onClick={() => void loadMore()}>Load more versions</Button>}
    </Box>
  )
}
