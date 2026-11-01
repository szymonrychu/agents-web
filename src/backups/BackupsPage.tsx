/** Settings > Backups: the S3 workspace archives with download, manual delete and the cleanup dry-run preview. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { archiveDownloadUrl, deleteArchives, listArchives } from '../api/archives'
import type { ArchiveView } from '../api/archives'
import { ApiError } from '../api/client'
import { formatAge, useNow } from '../chat/agentAge'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import type { FormErrorValue } from '../triggers'
import { CleanupPreviewDialog } from './CleanupPreviewDialog'
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Backups</Typography>
        {!notConfigured && <Button variant="outlined" onClick={() => setPreviewing(true)}>Cleanup preview</Button>}
      </Box>
      <FormError error={error} />
      {notConfigured ? (
        <Typography color="text.secondary">Archive storage is not configured on this orchestrator</Typography>
      ) : items && items.length === 0 ? (
        <Typography color="text.secondary">No archives yet</Typography>
      ) : (
        items && (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Name', 'Size', 'Age', 'Referenced by', ''].map((h, i) => <TableCell key={i} align={h === 'Size' ? 'right' : undefined}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.key}>
                  <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                    {a.name}
                    {a.protected && <Chip size="small" color="warning" label="protected" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell align="right">{formatBytes(a.size)}</TableCell>
                  <TableCell>{`${formatAge(now - Date.parse(a.last_modified))} ago`}</TableCell>
                  <TableCell>{a.referenced_by.join(', ')}</TableCell>
                  <TableCell align="right">
                    <Link href={archiveDownloadUrl(a.key)} download aria-label={`Download ${a.name}`} sx={{ mr: 1 }}>Download</Link>
                    <Button size="small" color="error" disabled={a.protected} aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
