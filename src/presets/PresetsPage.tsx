/** Settings > Presets: the stored SessionSpec templates, with create, edit, copy and delete. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { deletePreset, listPresets } from '../api/client'
import type { PresetView } from '../api/client'
import { useProject } from '../projects/ProjectContext'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { LabelChips } from '../labels/LabelChips'
import { TOKENS } from '../theme'
import { PresetForm } from './PresetForm'

export interface PresetsPageProps {
  onBack: () => void
}

/** The open editor: a new preset, an edit of one, or a copy of one. */
type Editor = { mode: 'new' } | { mode: 'edit'; preset: PresetView } | { mode: 'copy'; preset: PresetView }

// The helper texts of the matching switches in PresetForm
const SUPERLEADER_HELP = 'superleader: can message the leaders of all sessions'
const SUPERLEADER_MANAGEABLE_HELP = 'The superleader sees this preset and the sessions, webhooks, schedules and chats that use it, and can start, stop and edit them'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function PresetsPage({ onBack }: PresetsPageProps) {
  const { project } = useProject()
  const [presets, setPresets] = useState<PresetView[]>([])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<PresetView | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Bumped after every save or delete; the effect below refetches the list.
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    listPresets(project)
      .then((list) => {
        if (cancelled) return
        // The default preset first, the rest in the server's order.
        setPresets([...list.filter((p) => p.is_default), ...list.filter((p) => !p.is_default)])
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(message(e))
      })
    return () => {
      cancelled = true
    }
  }, [version, project])

  async function confirmDelete(preset: PresetView) {
    setDeleting(null)
    try {
      await deletePreset(preset.id)
    } catch (e) {
      setError(message(e))
      return
    }
    reload()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Presets</Typography>
        <Button variant="outlined" onClick={() => setEditor({ mode: 'new' })}>New preset</Button>
      </Box>
      {error && <Alert severity="error" variant="outlined">{error}</Alert>}
      <List disablePadding>
        {presets.map((p) => (
          <ListItem key={p.id} divider sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
            <Box sx={{ flex: '1 1 16rem', minWidth: 0 }}>
              <ListItemText primary={p.name} secondary={p.labels?.length ? <LabelChips labels={p.labels} /> : undefined} slotProps={{ secondary: { component: 'div' } }} sx={{ overflowWrap: 'anywhere' }} />
              {/* One wrapping container for every badge: add further chips here, no layout change needed */}
              <Box data-testid="preset-chips" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Chip size="small" variant="outlined" label={p.project} />
                {p.is_default && <Chip size="small" label="Default" />}
                {p.spec.session_messaging === true && (
                  <Tooltip describeChild title={SUPERLEADER_HELP}>
                    <Chip size="small" tabIndex={0} label="Superleader" />
                  </Tooltip>
                )}
                {p.superleader_manageable && (
                  <Tooltip describeChild title={SUPERLEADER_MANAGEABLE_HELP}>
                    <Chip size="small" tabIndex={0} label="Superleader-managed" />
                  </Tooltip>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <Button size="small" aria-label={`Edit ${p.name}`} onClick={() => setEditor({ mode: 'edit', preset: p })}>Edit</Button>
              <Button size="small" aria-label={`Copy ${p.name}`} onClick={() => setEditor({ mode: 'copy', preset: p })}>Copy</Button>
              {!p.is_default && <Button size="small" color="error" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>Delete</Button>}
            </Box>
          </ListItem>
        ))}
      </List>
      {editor && (
        <PresetForm
          open
          preset={editor.mode === 'edit' ? editor.preset : undefined}
          copyOf={editor.mode === 'copy' ? editor.preset : undefined}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            reload()
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete preset ${deleting?.name ?? ''}?`}
        body="Sessions already created from it keep their own copy of the spec."
        confirmLabel="Delete"
        onConfirm={() => deleting && void confirmDelete(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </Box>
  )
}
