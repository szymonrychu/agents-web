/** Right-hand panel of the Mindmaps page: one node with its notes, status, growth areas, edges and links. */
import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import { Markdown } from '../markdown/Markdown'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { conflictVersion, getNode, NODE_STATUSES, patchGrowth, patchNode } from './api'
import type { GrowthView, NodeStatus, NodeView } from './api'
import { DirectionDialog } from './DirectionDialog'
import { ArchiveDialog, DeleteDialog, GrowthDialog, LinkDialog, NodeDialog } from './EditDialogs'
import type { DeleteTarget } from './EditDialogs'
import { NodeHistory } from './NodeHistory'

type Dialog =
  | { kind: 'child' }
  | { kind: 'growth'; growth?: GrowthView }
  | { kind: 'link' }
  | { kind: 'direction' }
  | { kind: 'archive' }
  | { kind: 'delete'; target: DeleteTarget }

export interface NodePanelProps {
  nodeKey: string
  /** Bumped by the page when the stream reports a change, to refetch. */
  refreshKey?: number
  /** Called after any change so the page refetches the graph. */
  onChanged: () => void
  /** Called after the node itself is deleted. */
  onDeleted: () => void
  onOpenNode: (key: string) => void
}

interface Draft {
  topic: string
  notes: string
  summary: string
}

export function NodePanel({ nodeKey, refreshKey = 0, onChanged, onDeleted, onOpenNode }: NodePanelProps) {
  const [node, setNode] = useState<NodeView>()
  const [error, setError] = useState<unknown>()
  const [draft, setDraft] = useState<Draft>()
  const [saveError, setSaveError] = useState<unknown>()
  /** Set when a save answered 409: the row version the node is at now. */
  const [conflict, setConflict] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog>()
  const [showHistory, setShowHistory] = useState(false)

  const [reloads, setReloads] = useState(0)
  const load = useCallback(() => setReloads((n) => n + 1), [])
  useEffect(() => {
    let live = true
    getNode(nodeKey).then(
      (n) => { if (live) { setNode(n); setError(undefined) } },
      (e: unknown) => { if (live) setError(e) },
    )
    return () => { live = false }
  }, [nodeKey, refreshKey, reloads])

  const changed = () => {
    setDialog(undefined)
    load()
    onChanged()
  }

  const save = async (version: number) => {
    if (!node || !draft) return
    setBusy(true)
    setSaveError(undefined)
    try {
      const saved = await patchNode(node.key, { version, topic: draft.topic, notes: draft.notes, summary: draft.summary })
      setNode(saved)
      setDraft(undefined)
      setConflict(undefined)
      onChanged()
    } catch (e) {
      const current = conflictVersion(e)
      if (current === undefined) setSaveError(e)
      else setConflict(current)
    } finally {
      setBusy(false)
    }
  }
  const reload = () => {
    setDraft(undefined)
    setConflict(undefined)
    load()
  }
  const setStatus = async (status: NodeStatus) => {
    if (!node) return
    try {
      setNode(await patchNode(node.key, { version: node.version, status }))
      onChanged()
    } catch (e) {
      if (conflictVersion(e) !== undefined) load()
      setSaveError(e)
    }
  }
  const moveGrowth = async (index: number, by: -1 | 1) => {
    const g = node?.growth_areas?.[index]
    if (!g) return
    try {
      await patchGrowth(g.key, { version: g.version, position: index + by })
      changed()
    } catch (e) {
      setSaveError(e)
    }
  }

  if (error) return <FormError error={error instanceof Error ? error : undefined} />
  if (!node) return <Typography color="text.secondary">Loading</Typography>

  const editing = draft !== undefined
  const growthAreas = node.growth_areas ?? []
  const edgeList = node.edges ?? []
  const linkList = node.links ?? []
  return (
    <Stack spacing={2} data-testid="node-panel" sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h6" component="h2" sx={{ wordBreak: 'break-word' }}>{node.topic}</Typography>
        <Typography variant="caption" color="text.secondary">{node.key} - version {node.version} - {node.project}</Typography>
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Status" value={node.status} onChange={(e) => void setStatus(e.target.value as NodeStatus)} sx={{ minWidth: 130 }}>
          {NODE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <Button size="small" onClick={() => setDialog({ kind: 'child' })}>Add child</Button>
        <Button size="small" onClick={() => setDialog({ kind: 'direction' })}>Send direction</Button>
        <Button size="small" onClick={() => setShowHistory((v) => !v)}>History</Button>
        <Button size="small" onClick={() => setDialog({ kind: 'archive' })}>Archive</Button>
        <Button size="small" color="error" onClick={() => setDialog({ kind: 'delete', target: { kind: 'node', key: node.key, label: node.topic } })}>Delete</Button>
      </Stack>

      <Box component="section" aria-label="Node notes">
        {editing ? (
          <Stack spacing={2}>
            <TextField label="Topic" size="small" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
            <TextField label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} multiline minRows={6} helperText="Markdown" />
            <TextField label="Change summary" size="small" required value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} helperText="One line saved with the new version" />
            {conflict !== undefined && (
              <Alert severity="warning" role="alert" action={
                <>
                  <Button color="inherit" size="small" onClick={() => reload()}>Reload</Button>
                  <Button color="inherit" size="small" disabled={busy} onClick={() => void save(conflict)}>Keep mine</Button>
                </>
              }>
                This node changed while you were editing (now at version {conflict}). Reload to see the latest and drop your edits, or keep yours to save them on top of it.
              </Alert>
            )}
            <FormError error={saveError instanceof Error ? saveError : undefined} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={busy || draft.summary.trim() === '' || conflict !== undefined} onClick={() => void save(node.version)}>Save</Button>
              <Button onClick={() => { setDraft(undefined); setConflict(undefined); setSaveError(undefined) }}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <>
            {node.notes === '' ? <Typography color="text.secondary">No notes yet</Typography> : <Markdown>{node.notes}</Markdown>}
            <Button size="small" startIcon={<EditIcon />} sx={{ mt: 1 }} onClick={() => setDraft({ topic: node.topic, notes: node.notes, summary: '' })}>Edit notes</Button>
            <FormError error={saveError instanceof Error ? saveError : undefined} />
          </>
        )}
      </Box>

      {showHistory && (
        <Box component="section" aria-label="History">
          <Typography variant="subtitle2">History</Typography>
          <NodeHistory nodeKey={node.key} rowVersion={node.version} refreshKey={refreshKey + reloads} onRestored={changed} />
        </Box>
      )}

      <Box component="section" aria-label="Growth areas">
        <Typography variant="subtitle2">Growth areas</Typography>
        <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {growthAreas.map((g, i) => (
            <Stack key={g.key} component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Chip size="small" label={g.status} />
              <Typography sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.sm, wordBreak: 'break-word' }}>{g.text}</Typography>
              <IconButton size="small" aria-label={`Move ${g.key} up`} disabled={i === 0} onClick={() => void moveGrowth(i, -1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
              <IconButton size="small" aria-label={`Move ${g.key} down`} disabled={i === growthAreas.length - 1} onClick={() => void moveGrowth(i, 1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
              <IconButton size="small" aria-label={`Edit ${g.key}`} onClick={() => setDialog({ kind: 'growth', growth: g })}><EditIcon fontSize="inherit" /></IconButton>
              <IconButton size="small" aria-label={`Delete ${g.key}`} onClick={() => setDialog({ kind: 'delete', target: { kind: 'growth', key: g.key, label: g.text } })}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
            </Stack>
          ))}
        </Stack>
        <Button size="small" onClick={() => setDialog({ kind: 'growth' })}>Add growth area</Button>
      </Box>

      <Box component="section" aria-label="Edges">
        <Typography variant="subtitle2">Edges</Typography>
        {edgeList.length === 0 && <Typography color="text.secondary" sx={{ fontSize: TOKENS.fontSizes.sm }}>None. Drag from one node handle to another in the graph to add one.</Typography>}
        <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {edgeList.map((e) => {
            const other = e.src === node.key ? e.dst : e.src
            return (
              <Stack key={e.key} component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Typography sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.sm }}>
                  {e.src === node.key ? `${e.kind.replace(/_/g, ' ')} ->` : `<- ${e.kind.replace(/_/g, ' ')}`}{' '}
                  <Button size="small" sx={{ minWidth: 0, p: 0 }} onClick={() => onOpenNode(other)}>{other}</Button>
                </Typography>
                <IconButton size="small" aria-label={`Delete ${e.key}`} onClick={() => setDialog({ kind: 'delete', target: { kind: 'edge', key: e.key, label: `edge ${e.key}` } })}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
              </Stack>
            )
          })}
        </Stack>
      </Box>

      <Box component="section" aria-label="Links">
        <Typography variant="subtitle2">Links</Typography>
        <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {linkList.map((l) => (
            <Stack key={l.id} component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Chip size="small" label={l.relation.replace(/_/g, ' ')} />
              <Typography sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.sm }}>{l.ref_key}{l.note ? ` - ${l.note}` : ''}</Typography>
              <IconButton size="small" aria-label={`Delete link ${l.ref_key}`} onClick={() => setDialog({ kind: 'delete', target: { kind: 'link', id: l.id, label: `link ${l.ref_key}` } })}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
            </Stack>
          ))}
        </Stack>
        <Button size="small" onClick={() => setDialog({ kind: 'link' })}>Add link</Button>
      </Box>

      {dialog?.kind === 'child' && <NodeDialog mapKey={node.map} parent={node.key} onClose={() => setDialog(undefined)} onSaved={(n) => { changed(); onOpenNode(n.key) }} />}
      {dialog?.kind === 'growth' && <GrowthDialog nodeKey={node.key} growth={dialog.growth} onClose={() => setDialog(undefined)} onSaved={changed} />}
      {dialog?.kind === 'direction' && <DirectionDialog mapKey={node.map} nodeKey={node.key} onClose={() => setDialog(undefined)} onSaved={changed} />}
      {dialog?.kind === 'link' && <LinkDialog target={{ kind: 'node', key: node.key }} onClose={() => setDialog(undefined)} onSaved={changed} />}
      {dialog?.kind === 'archive' && <ArchiveDialog target={{ kind: 'node', item: node }} onClose={() => setDialog(undefined)} onSaved={changed} />}
      {dialog?.kind === 'delete' && (
        <DeleteDialog target={dialog.target} onClose={() => setDialog(undefined)} onDeleted={() => { if (dialog.target.kind === 'node') onDeleted(); else changed() }} />
      )}
    </Stack>
  )
}
