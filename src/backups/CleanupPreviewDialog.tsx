/** Dry-run preview of the archive cleanup sweep: what it would delete now and the retention settings. Deletes nothing. */
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { cleanupPreview } from '../api/archives'
import type { CleanupPreview } from '../api/archives'
import { formatBytes } from './format'

export interface CleanupPreviewDialogProps {
  open: boolean
  onClose: () => void
}

const sweepText = (p: CleanupPreview) => (!p.sweep_enabled ? 'Sweep is off' : p.sweep_dry_run ? 'Sweep is on, in dry-run mode: nothing is deleted automatically' : 'Sweep is on: these archives are deleted automatically')

export function CleanupPreviewDialog({ open, onClose }: CleanupPreviewDialogProps) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const p = await cleanupPreview()
        if (!cancelled) setPreview(p)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      setPreview(null)
      setError(null)
    }
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="cleanup-preview-title">
      <DialogTitle id="cleanup-preview-title">Cleanup preview</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!preview && !error && <Typography color="text.secondary">Loading</Typography>}
        {preview && (
          <>
            <Typography variant="body2" color="text.secondary">
              Keep archives newer than {preview.retention_days} days and the newest {preview.keep_newest} per name; archives a live session references are never deleted.
            </Typography>
            <Typography variant="body2" color="text.secondary">{sweepText(preview)}</Typography>
            {preview.would_delete.length === 0 ? (
              <Typography>Nothing would be deleted</Typography>
            ) : (
              <>
                <Typography>{`${preview.count} archives, ${formatBytes(preview.total_bytes)} would be deleted`}</Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Archive</TableCell>
                      <TableCell align="right">Size</TableCell>
                      <TableCell>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.would_delete.map((i) => (
                      <TableRow key={i.key}>
                        <TableCell sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{i.key}</TableCell>
                        <TableCell align="right">{formatBytes(i.size)}</TableCell>
                        <TableCell>{i.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
