/** Settings > Backups: named, versioned backups with their versions, download, copy-to and delete, and the cleanup policy. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { copyBackup, deleteName, deleteVersion, listBackups } from '../api/backups'
import type { BackupNameView, BackupVersionView } from '../api/backups'
import { ApiError } from '../api/client'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'
import { CleanupPreviewDialog } from './CleanupPreviewDialog'
import { CleanupSettingsCard } from './CleanupSettingsCard'
import { CopyBackupDialog } from './CopyBackupDialog'
import { VersionsPanel } from './VersionsPanel'
import { formatBytes } from './format'

export interface BackupsPageProps {
  onBack: () => void
}

interface CopyTarget {
  source: string
  sourceVersion?: string
}

type Deleting = { name: string } | { name: string; version: BackupVersionView }

export function BackupsPage({ onBack }: BackupsPageProps) {
  const now = useNow()
  // `?name=<name>` (linked from the sessions and presets screens) prefills the filter
  const [params] = useSearchParams()
  const [filter, setFilter] = useState(params.get('name') ?? '')
  const [items, setItems] = useState<BackupNameView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<FormErrorValue>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [copying, setCopying] = useState<CopyTarget | null>(null)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [generation, setGeneration] = useState(0)

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 503) setNotConfigured(true)
    else setError(e instanceof Error ? e : String(e))
  }, [])

  // the first page again whenever the filter or `generation` changes (mount, after a copy or a delete)
  useEffect(() => {
    let cancelled = false
    listBackups({ q: filter || undefined }).then(
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
  }, [filter, generation, fail])

  const loadMore = async () => {
    setError(null)
    try {
      const page = await listBackups({ q: filter || undefined, cursor })
      setItems((prev) => [...(prev ?? []), ...page.items])
      setCursor(page.next_cursor)
    } catch (e) {
      fail(e)
    }
  }

  const refresh = () => setGeneration((g) => g + 1)

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })

  // a copy into the same name makes an older version current
  const makeCurrent = async (name: string, v: BackupVersionView) => {
    setError(null)
    try {
      await copyBackup({ source: name, sourceVersion: v.id, target: name })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    }
  }

  const remove = async () => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    try {
      if ('version' in target) await deleteVersion(target.name, target.version.id)
      else await deleteName(target.name)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e : String(e))
    }
  }

  const columns: Column<BackupNameView>[] = [
    {
      key: 'name', label: 'Name', role: 'primary', sx: { wordBreak: 'normal' },
      render: (b) => (
        <>
          <Box component="span" sx={{ fontFamily: 'monospace' }}>{b.name}</Box>
          {b.protected && <Chip size="small" color="warning" label="protected" sx={{ ml: 1 }} />}
        </>
      ),
    },
    { key: 'size', label: 'Size', role: 'meta', align: 'right', render: (b) => (b.current ? formatBytes(b.current.size) : '-') },
    { key: 'age', label: 'Age', role: 'meta', render: (b) => (b.current ? `${formatAge(now - Date.parse(b.current.saved_at))} ago` : '-') },
    { key: 'slug', label: 'Saved by', role: 'meta', render: (b) => b.current?.session_slug ?? '-' },
    { key: 'versions', label: 'Versions', role: 'meta', align: 'right', render: (b) => b.version_count },
    { key: 'referenced', label: 'Referenced by', role: 'meta', render: (b) => b.referenced_by.join(', ') || '-' },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Backups" onBack={onBack}>
        {!notConfigured && <Button variant="outlined" onClick={() => setPreviewing(true)}>Cleanup preview</Button>}
      </PageHeader>
      <FormError error={error} />
      {!notConfigured && <CleanupSettingsCard />}
      {!notConfigured && (
        <TextField size="small" label="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ maxWidth: 400 }} />
      )}
      {notConfigured ? (
        <Typography color="text.secondary">Backup storage is not configured on this orchestrator</Typography>
      ) : items && items.length === 0 ? (
        <Typography color="text.secondary">No backups yet</Typography>
      ) : (
        items && (
          <ResponsiveTable
            rows={items}
            columns={columns}
            rowKey={(b) => b.name}
            ariaLabel="Backups"
            cardLabel={(b) => `Backup ${b.name}`}
            actions={(b) => [
              { label: 'Versions', ariaLabel: `Versions ${b.name}`, expanded: expanded.has(b.name), onClick: () => toggle(b.name) },
              { label: 'Copy to...', ariaLabel: `Copy ${b.name} to`, onClick: () => setCopying({ source: b.name }) },
              { label: 'Delete', ariaLabel: `Delete ${b.name}`, color: 'error', disabled: b.protected, onClick: () => setDeleting({ name: b.name }) },
            ]}
            below={(b) =>
              expanded.has(b.name) && (
                <VersionsPanel
                  key={`${b.name}-${generation}`}
                  name={b.name}
                  versionCount={b.version_count}
                  onCopy={(v) => setCopying({ source: b.name, sourceVersion: v.id })}
                  onMakeCurrent={(v) => void makeCurrent(b.name, v)}
                  onDelete={(v) => setDeleting({ name: b.name, version: v })}
                />
              )
            }
          />
        )
      )}
      {cursor !== null && <Button onClick={() => void loadMore()}>Load more</Button>}
      <CopyBackupDialog
        open={copying !== null}
        source={copying?.source ?? ''}
        sourceVersion={copying?.sourceVersion}
        onClose={() => setCopying(null)}
        onCopied={() => {
          setCopying(null)
          refresh()
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting && 'version' in deleting ? 'Delete version?' : 'Delete backup?'}
        confirmLabel="Delete"
        body={
          deleting && 'version' in deleting
            ? `Version ${deleting.version.id} of ${deleting.name} is removed from S3 and cannot be restored.`
            : deleting
              ? `${deleting.name} and all its versions are removed from S3 and cannot be restored.`
              : undefined
        }
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
      <CleanupPreviewDialog open={previewing} onClose={() => setPreviewing(false)} />
    </Box>
  )
}
