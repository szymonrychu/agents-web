/** Create, edit, archive and hard-delete dialogs of the Mindmaps page (maps, nodes, growth areas, links). */
import { useState } from 'react'
import type { ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import {
  createGrowth, createMap, createMapLink, createNode, createNodeLink, deleteEdge, deleteGrowth, deleteLink, deleteMap, deleteNode,
  GROWTH_STATUSES, LINK_RELATIONS, NODE_STATUSES, patchGrowth, patchMap, patchNode,
} from './api'
import type { GrowthStatus, GrowthView, LinkRelation, MapView, NodeStatus, NodeView } from './api'

interface ShellProps {
  title: string
  submit: string
  color?: 'primary' | 'error'
  disabled?: boolean
  onClose: () => void
  /** Resolves when the change is saved; a rejection is shown in the dialog. */
  onSubmit: () => Promise<unknown>
  children: ReactNode
}

function Shell({ title, submit, color = 'primary', disabled = false, onClose, onSubmit, children }: ShellProps) {
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {children}
        <FormError error={error instanceof Error ? error : undefined} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={color} disabled={busy || disabled} onClick={() => void run()}>{submit}</Button>
      </DialogActions>
    </Dialog>
  )
}

const Select = ({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) => (
  <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <MenuItem key={o} value={o}>{o.replace(/_/g, ' ')}</MenuItem>)}
  </TextField>
)

export interface SavedProps<T> {
  onClose: () => void
  onSaved: (saved: T) => void
}

/** Create (no `map`) or edit a map; edit changes title and description only. */
export function MapDialog({ map, project, onClose, onSaved }: SavedProps<MapView> & { map?: MapView; project?: string }) {
  const [proj, setProj] = useState(project ?? '')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState(map?.title ?? '')
  const [description, setDescription] = useState(map?.description ?? '')
  const [kind, setKind] = useState<'research' | 'knowledge'>('research')
  const [rootTopic, setRootTopic] = useState('')
  const valid = title.trim() !== '' && (map !== undefined || (proj.trim() !== '' && slug.trim() !== ''))
  const submit = async () => {
    if (map) return onSaved(await patchMap(map.key, { version: map.version, title: title.trim(), description }))
    onSaved(await createMap({ project: proj.trim(), slug: slug.trim(), title: title.trim(), description, kind, root_topic: rootTopic.trim() || null }))
  }
  return (
    <Shell title={map ? `Edit ${map.title}` : 'New map'} submit={map ? 'Save' : 'Create'} disabled={!valid} onClose={onClose} onSubmit={submit}>
      {!map && <TextField label="Project" value={proj} onChange={(e) => setProj(e.target.value)} required />}
      {!map && <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required helperText="Lowercase letters, digits and hyphens" />}
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
      {!map && <Select label="Kind" value={kind} options={['research', 'knowledge']} onChange={(v) => setKind(v as 'research' | 'knowledge')} />}
      {!map && <TextField label="Root topic" value={rootTopic} onChange={(e) => setRootTopic(e.target.value)} helperText="Defaults to the title" />}
    </Shell>
  )
}

/** Create a node under `parent` (the first node of a map is its root and is created with the map). */
export function NodeDialog({ mapKey, parent, onClose, onSaved }: SavedProps<NodeView> & { mapKey: string; parent: string | null }) {
  const [topic, setTopic] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<NodeStatus>('seed')
  const submit = async () => onSaved(await createNode(mapKey, { topic: topic.trim(), summary, notes, status, parent }))
  return (
    <Shell title={parent ? `New node under ${parent}` : 'New node'} submit="Create" disabled={topic.trim() === ''} onClose={onClose} onSubmit={submit}>
      <TextField label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} required />
      <TextField label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={4} helperText="Markdown" />
      <Select label="Status" value={status} options={NODE_STATUSES} onChange={(v) => setStatus(v as NodeStatus)} />
    </Shell>
  )
}

/** Add a growth area to `nodeKey`, or edit text and status of `growth`. */
export function GrowthDialog({ nodeKey, growth, onClose, onSaved }: SavedProps<GrowthView> & { nodeKey: string; growth?: GrowthView }) {
  const [text, setText] = useState(growth?.text ?? '')
  const [status, setStatus] = useState<string>(growth?.status ?? 'open')
  const submit = async () =>
    onSaved(growth ? await patchGrowth(growth.key, { version: growth.version, text: text.trim(), status: status as GrowthStatus }) : await createGrowth(nodeKey, text.trim()))
  return (
    <Shell title={growth ? `Edit growth area ${growth.key}` : 'New growth area'} submit={growth ? 'Save' : 'Add'} disabled={text.trim() === ''} onClose={onClose} onSubmit={submit}>
      <TextField label="Growth area" value={text} onChange={(e) => setText(e.target.value)} required multiline minRows={2} />
      {growth && <Select label="Status" value={status} options={GROWTH_STATUSES} onChange={setStatus} />}
    </Shell>
  )
}

export type LinkTarget = { kind: 'map' | 'node'; key: string }

/** Link a task or spec key to a map or a node. */
export function LinkDialog({ target, onClose, onSaved }: SavedProps<unknown> & { target: LinkTarget }) {
  const [refKey, setRefKey] = useState('')
  const [relation, setRelation] = useState<LinkRelation>('researched_by')
  const [note, setNote] = useState('')
  const submit = async () => {
    const body = { ref_key: refKey.trim(), relation, note }
    onSaved(target.kind === 'map' ? await createMapLink(target.key, body) : await createNodeLink(target.key, body))
  }
  return (
    <Shell title={`Link to ${target.key}`} submit="Add link" disabled={refKey.trim() === ''} onClose={onClose} onSubmit={submit}>
      <TextField label="Task or spec key" value={refKey} onChange={(e) => setRefKey(e.target.value)} required helperText="For example T-12 or S-3" />
      <Select label="Relation" value={relation} options={LINK_RELATIONS} onChange={(v) => setRelation(v as LinkRelation)} />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
    </Shell>
  )
}

export type ArchiveTarget = { kind: 'map'; item: MapView } | { kind: 'node'; item: NodeView }

/** Archive a map or a node: it stays, hidden from the active lists, and can be restored by editing its status. */
export function ArchiveDialog({ target, onClose, onSaved }: SavedProps<unknown> & { target: ArchiveTarget }) {
  const name = target.kind === 'map' ? target.item.title : target.item.topic
  const submit = async () =>
    onSaved(target.kind === 'map' ? await patchMap(target.item.key, { version: target.item.version, status: 'archived' }) : await patchNode(target.item.key, { version: target.item.version, status: 'archived' }))
  return (
    <Shell title={`Archive ${name}`} submit="Archive" onClose={onClose} onSubmit={submit}>
      <Typography>Archive this {target.kind}? Nothing is deleted; it is hidden from the active lists.</Typography>
    </Shell>
  )
}

export type DeleteTarget =
  | { kind: 'map'; key: string; label: string }
  /** `descendants` is the number of nodes below it when known (the page counts them in the loaded graph). */
  | { kind: 'node'; key: string; label: string; descendants?: number }
  | { kind: 'growth'; key: string; label: string }
  | { kind: 'edge'; key: string; label: string }
  | { kind: 'link'; id: number; label: string }

const descendantText = (n: number | undefined): string =>
  n === undefined ? 'the node and all its descendant nodes' : n === 0 ? 'the node (it has no descendant nodes)' : `the node and its ${n} descendant ${n === 1 ? 'node' : 'nodes'}`

/** What a hard delete takes with it, spelled out in the confirm dialog. */
export function cascadeText(t: DeleteTarget): string {
  switch (t.kind) {
    case 'map':
      return 'This also deletes every node of the map with its versions, growth areas, edges, links and directions.'
    case 'node':
      return `This also deletes ${descendantText(t.descendants)}, with their versions, growth areas, edges, links and directions.`
    case 'growth':
      return 'Nodes grown from this growth area stay; they only lose the reference.'
    case 'edge':
      return 'Only the connection is deleted; both nodes stay.'
    case 'link':
      return 'Only the link is deleted; the task or spec stays.'
  }
}

const removeTarget = (t: DeleteTarget): Promise<void> => {
  switch (t.kind) {
    case 'map': return deleteMap(t.key)
    case 'node': return deleteNode(t.key)
    case 'growth': return deleteGrowth(t.key)
    case 'edge': return deleteEdge(t.key)
    case 'link': return deleteLink(t.id)
  }
}

export function DeleteDialog({ target, onClose, onDeleted }: { target: DeleteTarget; onClose: () => void; onDeleted: () => void }) {
  return (
    <Shell title={`Delete ${target.label}`} submit="Delete" color="error" onClose={onClose} onSubmit={async () => { await removeTarget(target); onDeleted() }}>
      <Typography>Delete this {target.kind === 'growth' ? 'growth area' : target.kind} permanently? This cannot be undone.</Typography>
      <Typography color="text.secondary">{cascadeText(target)}</Typography>
    </Shell>
  )
}
