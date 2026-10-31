/** The global preamble: the Jinja template that opens every prompt sent to the agents, with preview and reset to the built-in default. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import TemplateEditor, { type TemplatePreview } from '../editor/TemplateEditor'
import { FormError } from '../triggers'
import { getSettings, previewTemplate, setSettings } from './api'
import type { SettingsView } from './api'

/** A preview function for the connector's template preview endpoint; `context` overrides the sample values. */
export const connectorPreview = (context?: Record<string, unknown>) => async (template: string): Promise<TemplatePreview> => {
  const out = await previewTemplate(template, context)
  return { rendered: out.rendered ?? null, error: out.error ?? null, variables: out.variables }
}

export function PreamblePanel() {
  const [settings, setLoaded] = useState<SettingsView>()
  const [text, setText] = useState('')
  const [error, setError] = useState<Error>()
  const [saved, setSaved] = useState(false)

  const apply = (s: SettingsView) => {
    setLoaded(s)
    setText(s.preamble ?? s.default_preamble)
  }
  const fail = (e: unknown) => setError(e instanceof Error ? e : new Error(String(e)))

  useEffect(() => {
    let cancelled = false
    getSettings().then((s) => { if (!cancelled) apply(s) }, (e: unknown) => { if (!cancelled) fail(e) })
    return () => { cancelled = true }
  }, [])

  // Only the preamble field is sent, always explicitly: PUT keeps omitted fields, and null clears the override.
  const put = async (preamble: string | null) => {
    setError(undefined)
    setSaved(false)
    try {
      apply(await setSettings({ preamble }))
      setSaved(true)
    } catch (e) {
      fail(e)
    }
  }

  const loaded = settings !== undefined
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 720 }}>
      <Typography component="h2" variant="subtitle1">Preamble</Typography>
      <FormError error={error} />
      <TemplateEditor
        label="Preamble" value={text} onChange={(v) => { setText(v); setSaved(false) }}
        preview={connectorPreview()} previewLabel="Preview preamble" disabled={!loaded}
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" disabled={!loaded} onClick={() => void put(text === settings?.default_preamble ? null : text)}>Save preamble</Button>
        <Button disabled={!loaded || settings?.preamble == null} onClick={() => void put(null)}>Reset to default</Button>
      </Box>
      {saved && <Typography color="success.main">Saved.</Typography>}
      <Typography variant="body2" color="text.secondary">
        Opens every prompt. Variables: room_name, room_id, sender, rule_name, now. A rule can carry its own preamble instead.
      </Typography>
    </Box>
  )
}
