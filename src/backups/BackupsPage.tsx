/** Settings > Backups: the S3 workspace archives with download, manual delete and the cleanup dry-run preview. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { archiveDownloadUrl, deleteArchives, listArchives } from '../api/archives'
import type { ArchiveView } from '../api/archives'
import { ApiError } from '../api/client'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'
import { CleanupPreviewDialog } from './CleanupPreviewDialog'
import { CleanupSettingsCard } from './CleanupSettingsCard'
import { formatBytes } from './format'


export interface BackupsPageProps {
  onBack: () => void
}

export function BackupsPage({ onBack }: BackupsPageProps) {
  const now = useNow()
  const [items, setItems] = useState<ArchiveView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<FormErrorValue>(null)
  const [deleting, setDeleting] = useState<ArchiveView | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [generation, setGeneration] = useState(0)

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 503) setNotConfigured(true)
    else setError(e instanceof Error ? e : String(e))
  }, [])

  // the first page again whenever `generation` changes (mount and after a delete)
  useEffect(() => {
    let cancelled = false
    listArchives().then(
      (page) => {
        if (cancelled) return
        setItems(page.items)
        setCursor(page.next_cursor)
      },
      (e: unknown) => !cancelled && fail(e),
    )
    return () => {
      cancelled = true
    }
  }, [generation, fail])

  const loadMore = async () => {
    setError(null)
    try {
      const page = await listArchives({ cursor })
      setItems((prev) => [...(prev ?? []), ...page.items])
      setCursor(page.next_cursor)
    } catch (e) {
      fail(e)
    }
  }

  const remove = async () => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    try {
      const result = await deleteArchives([target.key])
      const problems = [...result.refused.map((r) => `${r.key}: ${r.reason}`), ...result.errors.map((r) => `${r.key}: ${r.message}`)]
      setError(problems.length > 0 ? problems.join('; ') : null)
      setGeneration((g) => g + 1)
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    }
  }

  const columns: Column<ArchiveView>[] = [
    {
      key: 'name', label: 'Name', role: 'primary', sx: { wordBreak: 'normal' },
      render: (a) => (
        <>
          <Box component="span" sx={{ fontFamily: 'monospace' }}>{a.name}</Box>
          {a.protected && <Chip size="small" color="warning" label="protected" sx={{ ml: 1 }} />}
        </>
      ),
    },
    { key: 'size', label: 'Size', role: 'meta', align: 'right', render: (a) => formatBytes(a.size) },
    { key: 'age', label: 'Age', role: 'meta', render: (a) => `${formatAge(now - Date.parse(a.last_modified))} ago` },
    { key: 'referenced', label: 'Referenced by', role: 'meta', render: (a) => a.referenced_by.join(', ') || '-' },
    {
      key: 'download', label: 'Download', role: 'control',
      render: (a) => (
        <Link href={archiveDownloadUrl(a.key)} download aria-label={`Download ${a.name}`} sx={{ display: 'inline-flex', alignItems: 'center', '@media (pointer: coarse)': { minHeight: 44 } }}>Download</Link>
      ),
    },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Backups" onBack={onBack}>
        {!notConfigured && <Button variant="outlined" onClick={() => setPreviewing(true)}>Cleanup preview</Button>}
      </PageHeader>
      <FormError error={error} />
      {!notConfigured && <CleanupSettingsCard />}
      {notConfigured ? (
        <Typography color="text.secondary">Archive storage is not configured on this orchestrator</Typography>
      ) : items && items.length === 0 ? (
        <Typography color="text.secondary">No archives yet</Typography>
      ) : (
        items && (
          <ResponsiveTable
            rows={items}
            columns={columns}
            rowKey={(a) => a.key}
            ariaLabel="Backups"
            cardLabel={(a) => `Backup ${a.name}`}
            actions={(a) => [{ label: 'Delete', ariaLabel: `Delete ${a.name}`, color: 'error', disabled: a.protected, onClick: () => setDeleting(a) }]}
          />
        )
      )}
      {cursor !== null && <Button onClick={() => void loadMore()}>Load more</Button>}
      <ConfirmDialog
        open={deleting !== null} title="Delete archive?" confirmLabel="Delete"
        body={deleting ? `${deleting.key} is removed from S3 and cannot be restored.` : undefined}
        onConfirm={() => void remove()} onCancel={() => setDeleting(null)}
      />
      <CleanupPreviewDialog open={previewing} onClose={() => setPreviewing(false)} />
    </Box>
  )
}
