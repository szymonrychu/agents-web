/** Endpoints table: URL, type, auth mode, preset name, times; edit, clone, filters in dialogs; rotate and delete behind a confirm. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { presetInProject } from '../projects/scope'
import { useProject } from '../projects/ProjectContext'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { FormError, ProjectCell, usePresetIndex } from '../triggers'
import { deleteEndpoint, getMeta, listEndpoints, rotateEndpoint } from './api'
import type { EndpointCreated, EndpointView, WebhookMeta } from './api'
import { CopyButton } from './copy'
import { CredentialsDialog } from './CredentialsDialog'
import { EndpointFormDialog, type EndpointFormMode } from './EndpointFormDialog'
import { FiltersDialog } from './FiltersDialog'
import { DateTime } from '../common/DateTime'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

export interface EndpointsListProps {
  refreshKey: number
  onChanged: () => void
  onCreate?: () => void
}

const ruleCount = (ep: EndpointView) => ep.filters.allow.length + ep.filters.deny.length

export function EndpointsList({ refreshKey, onChanged, onCreate }: EndpointsListProps) {
  const [endpoints, setEndpoints] = useState<EndpointView[] | null>(null)
  const presets = usePresetIndex()
  const { project } = useProject()
  const [error, setError] = useState<unknown>(null)
  const [rotating, setRotating] = useState<EndpointView | null>(null)
  const [deleting, setDeleting] = useState<EndpointView | null>(null)
  const [credentials, setCredentials] = useState<EndpointCreated | null>(null)
  const [editing, setEditing] = useState<EndpointView | null>(null)
  const [form, setForm] = useState<{ mode: EndpointFormMode; endpoint: EndpointView } | null>(null)
  const [meta, setMeta] = useState<WebhookMeta | null>(null)
  const [metaError, setMetaError] = useState<unknown>(null)

  useEffect(() => {
    let live = true
    getMeta().then((m) => { if (live) setMeta(m) }, (e: unknown) => { if (live) setMetaError(e) })
    return () => { live = false }
  }, [])
  useEffect(() => {
    let cancelled = false
    listEndpoints().then(
      (list) => !cancelled && setEndpoints(list),
      (e: unknown) => !cancelled && setError(e),
    )
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // The editor drops rules whose field is not listed: until the type's fields are loaded, Filters stays disabled
  // so stored rules are never shown against an empty list and erased by a save.
  const fieldsOf = (ep: EndpointView) => meta?.filter_fields[ep.type]
  const editingFields = editing ? fieldsOf(editing) : undefined

  const rotate = async () => {
    const target = rotating
    setRotating(null)
    if (!target) return
    try {
      setCredentials(await rotateEndpoint(String(target.id)))
      onChanged()
    } catch (e) {
      setError(e)
    }
  }
  // A one-time secret or password is shown only when the call issued one (a plain edit issues none).
  const formDone = (result: EndpointCreated) => {
    setForm(null)
    if (result.secret || result.password) setCredentials(result)
    onChanged()
  }
  const remove = async () => {
    const target = deleting
    setDeleting(null)
    if (!target) return
    try {
      await deleteEndpoint(String(target.id))
      onChanged()
    } catch (e) {
      setError(e)
    }
  }

  const columns: Column<EndpointView>[] = [
    {
      key: 'url', label: 'URL', role: 'primary', sx: { wordBreak: 'break-all' },
      render: (ep) => <><span>{ep.url}</span> <CopyButton label="Copy URL" value={ep.url} /></>,
    },
    { key: 'type', label: 'Type', role: 'meta', render: (ep) => ep.type },
    { key: 'auth', label: 'Auth', role: 'none', render: (ep) => ep.auth_mode },
    { key: 'preset', label: 'Preset', role: 'none', render: (ep) => presets[ep.preset_id]?.name ?? ep.preset_id },
    { key: 'project', label: 'Project', role: 'none', sx: { whiteSpace: 'nowrap' }, render: (ep) => <ProjectCell presetId={ep.preset_id} index={presets} /> },
    { key: 'username', label: 'Username', role: 'none', render: (ep) => ep.username },
    { key: 'created', label: 'Created', role: 'meta', render: (ep) => <DateTime iso={ep.created_at} /> },
    { key: 'rotated', label: 'Rotated', role: 'meta', render: (ep) => <DateTime iso={ep.credentials_rotated_at} /> },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormError error={error as never} />
      <FormError error={metaError as never} />
      {endpoints && endpoints.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography color="text.secondary">No endpoints yet</Typography>
          {onCreate && <Button variant="outlined" onClick={onCreate}>New endpoint</Button>}
        </Box>
      ) : (
        <ResponsiveTable
          rows={(endpoints ?? []).filter((ep) => presetInProject(ep.preset_id, presets, project))}
          columns={columns}
          rowKey={(ep) => String(ep.id)}
          ariaLabel="Endpoints"
          cardLabel={(ep) => `Endpoint ${ep.suffix}`}
          actions={(ep) => [
            { label: 'Edit', onClick: () => setForm({ mode: 'edit', endpoint: ep }) },
            { label: 'Clone', onClick: () => setForm({ mode: 'clone', endpoint: ep }) },
            { label: `Filters (${ruleCount(ep)})`, disabled: !fieldsOf(ep), onClick: () => setEditing(ep) },
            { label: 'Rotate credentials', onClick: () => setRotating(ep) },
            { label: 'Delete', color: 'error', onClick: () => setDeleting(ep) },
          ]}
        />
      )}
      <ConfirmDialog
        open={rotating !== null} title="Rotate credentials?" confirmLabel="Rotate"
        body={rotating ? `A new ${rotating.auth_mode === 'basic' ? 'password' : 'secret'} is issued for ${rotating.url}; the old one stops working at once.` : undefined}
        onConfirm={() => void rotate()} onCancel={() => setRotating(null)}
      />
      <ConfirmDialog
        open={deleting !== null} title="Delete endpoint?" confirmLabel="Delete"
        body={deleting ? `${deleting.url} stops accepting events.` : undefined}
        onConfirm={() => void remove()} onCancel={() => setDeleting(null)}
      />
      {editing && editingFields && (
        <FiltersDialog
          open endpoint={editing} fields={editingFields}
          onClose={() => setEditing(null)} onSaved={() => onChanged()}
        />
      )}
      {form && (
        <EndpointFormDialog
          open mode={form.mode} endpoint={form.endpoint} onClose={() => setForm(null)} onDone={formDone}
          onRotate={() => { setRotating(form.endpoint); setForm(null) }}
        />
      )}
      <CredentialsDialog endpoint={credentials} onClose={() => setCredentials(null)} />
    </Box>
  )
}
