/** Volumes: project-labelled shared storage objects, create, inspect, save, restore, resize and delete. */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { DateTime } from '../common/DateTime'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'
import { FormError } from '../triggers'
import { listVolumes, volumeErrorText } from './api'
import type { VolumeView } from './api'
import { CreateVolumeDialog, useCaps } from './CreateVolumeDialog'
import { VolumeDetailDrawer } from './VolumeDetailDrawer'

export function VolumesPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<VolumeView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<string>()
  const caps = useCaps()
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    let live = true
    listVolumes()
      .then((list) => live && (setRows(list), setError(undefined)))
      .catch((e: unknown) => live && (setRows([]), setError(volumeErrorText(e))))
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [tick])

  const columns: Column<VolumeView>[] = [
    { key: 'name', label: 'Name', role: 'primary', render: (v) => v.name },
    { key: 'projects', label: 'Projects', role: 'meta', render: (v) => v.projects.join(', ') },
    { key: 'size', label: 'Size', role: 'meta', render: (v) => v.size },
    { key: 'class', label: 'Class', role: 'meta', render: (v) => v.storage_class },
    { key: 'state', label: 'State', role: 'meta', render: (v) => (v.state_reason ? `${v.state} (${v.state_reason})` : v.state) },
    { key: 'presets', label: 'Attached presets', role: 'meta', render: (v) => v.attachments },
    { key: 'mounted', label: 'Mounted sessions', role: 'meta', render: (v) => v.mounted },
    { key: 'save', label: 'Last save', role: 'meta', render: (v) => <DateTime iso={v.last_save_at} /> },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Volumes" onBack={onBack}>
        <Button variant="contained" onClick={() => setCreating(true)}>New volume</Button>
      </PageHeader>
      <Alert severity="info">A volume whose mounting sessions never end is saved on demand only: use Save now.</Alert>
      <FormError error={error} />
      {loaded && !error && rows.length === 0 && <Typography color="text.secondary">No volumes.</Typography>}
      {rows.length > 0 && (
        <ResponsiveTable
          rows={rows}
          columns={columns}
          rowKey={(v) => v.id}
          ariaLabel="Volumes"
          cardLabel={(v) => `Volume ${v.name}`}
          actions={(v) => [{ label: 'Details', ariaLabel: `Details of ${v.name}`, onClick: () => setDetail(v.id) }]}
        />
      )}
      {creating && (
        <CreateVolumeDialog
          caps={caps}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
      {detail && <VolumeDetailDrawer volumeId={detail} caps={caps} onClose={() => setDetail(undefined)} onChanged={reload} />}
    </Box>
  )
}
