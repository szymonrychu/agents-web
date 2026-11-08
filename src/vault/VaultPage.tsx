/** Settings > Vault: entries of secret env values, create, edit, rotate, duplicate, delete and detail. */
import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { listEntries } from './api'
import type { EntryView } from './api'
import { DeleteDialog } from './DeleteDialog'
import { DetailPanel } from './DetailPanel'
import { EditDialog } from './EditDialog'
import { duplicateInit, EntryDialog } from './EntryDialog'
import type { EntryInit } from './EntryDialog'
import { RotateDialog } from './RotateDialog'

type Dialog =
  | { kind: 'create'; init?: EntryInit }
  | { kind: 'edit' | 'rotate' | 'delete'; entry: EntryView }

const matches = (e: EntryView, text: string) => {
  const t = text.toLowerCase()
  return t === '' || [e.name, e.description, ...e.labels, ...e.envs.map((v) => v.env)].some((s) => s.toLowerCase().includes(t))
}

export function VaultPage({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<EntryView[]>([])
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<unknown>()
  const [loaded, setLoaded] = useState(false)
  const [dialog, setDialog] = useState<Dialog>()
  const [detailId, setDetailId] = useState<string>()

  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)
  useEffect(() => {
    let live = true
    listEntries()
      .then((list) => {
        if (!live) return
        setEntries(list)
        setError(undefined)
      })
      .catch((e: unknown) => live && setError(e))
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [tick])

  const allLabels = useMemo(() => [...new Set(entries.flatMap((e) => e.labels))].sort(), [entries])
  const shown = entries.filter((e) => matches(e, text) && (label === '' || e.labels.includes(label)))
  const done = () => {
    setDialog(undefined)
    reload()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Vault</Typography>
        <Button variant="contained" onClick={() => setDialog({ kind: 'create' })}>New entry</Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Filter" value={text} onChange={(e) => setText(e.target.value)} sx={{ flexGrow: 1, minWidth: 240 }} />
        <TextField
          size="small"
          select
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        >
          <option value="">All labels</option>
          {allLabels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </TextField>
      </Box>
      <FormError error={error instanceof Error ? error : undefined} />
      {detailId && <DetailPanel key={detailId} entryId={detailId} onClose={() => setDetailId(undefined)} />}
      {loaded && !error && shown.length === 0 && <Typography color="text.secondary">No entries.</Typography>}
      {shown.map((e) => (
        <Paper key={e.id} variant="outlined" component="article" aria-label={`Entry ${e.name}`} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 500 }}>{e.name}</Typography>
            {e.labels.map((l) => (
              <Chip key={l} size="small" label={l} onClick={() => setLabel(l)} />
            ))}
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="text.secondary">attachments: {e.attachments_count ?? 'unknown'}</Typography>
          </Box>
          {e.description && <Typography variant="body2" color="text.secondary">{e.description}</Typography>}
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {e.envs.map((v) => (
              <li key={v.env}>
                <code>{v.env}</code> = {v.protected ? <em>set, v{e.version}</em> : <code>{v.value}</code>}
              </li>
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => setDetailId(e.id)}>Details</Button>
            <Button size="small" onClick={() => setDialog({ kind: 'edit', entry: e })}>Edit</Button>
            {e.envs.some((v) => v.protected) && <Button size="small" onClick={() => setDialog({ kind: 'rotate', entry: e })}>Rotate</Button>}
            <Button size="small" onClick={() => setDialog({ kind: 'create', init: duplicateInit(e) })}>Duplicate as new</Button>
            <Button size="small" color="error" onClick={() => setDialog({ kind: 'delete', entry: e })}>Delete</Button>
          </Box>
        </Paper>
      ))}
      {dialog?.kind === 'create' && <EntryDialog init={dialog.init} onClose={() => setDialog(undefined)} onCreated={done} />}
      {dialog?.kind === 'edit' && <EditDialog entry={dialog.entry} onClose={() => setDialog(undefined)} onSaved={done} />}
      {dialog?.kind === 'rotate' && <RotateDialog entry={dialog.entry} onClose={() => setDialog(undefined)} onRotated={done} />}
      {dialog?.kind === 'delete' && (
        <DeleteDialog
          entry={dialog.entry}
          onClose={() => setDialog(undefined)}
          onDeleted={() => {
            if (detailId === dialog.entry.id) setDetailId(undefined)
            done()
          }}
        />
      )}
    </Box>
  )
}
