/** The preset used by rooms without their own, with the default policy explained. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { FormError, PresetSelect } from '../triggers'
import { getSettings, setSettings } from './api'
import type { MatrixMeta } from './api'

export function DefaultPreset({ meta }: { meta: MatrixMeta | undefined }) {
  const [preset, setPreset] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<Error>()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSettings().then((s) => {
      if (cancelled) return
      setPreset(s.default_preset_id ?? '')
      setLoaded(true)
    }, (e: unknown) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))))
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setError(undefined)
    setSaved(false)
    try {
      const s = await setSettings({ default_preset_id: preset || null })
      setPreset(s.default_preset_id ?? '')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 480 }}>
      <Typography component="h2" variant="subtitle1">Default preset</Typography>
      <FormError error={error} />
      <PresetSelect value={preset} onChange={(v) => { setPreset(v); setSaved(false) }} disabled={!loaded} emptyLabel="None" />
      <Button variant="contained" disabled={!loaded} onClick={() => void save()} sx={{ alignSelf: 'flex-start' }}>Save</Button>
      {saved && <Typography color="success.main">Saved.</Typography>}
      <Typography variant="body2" color="text.secondary">
        Rooms without their own preset use this one.
        {meta && ` The default policy is ${meta.default_policy}: it applies to rooms and users no rule covers.`}
      </Typography>
    </Box>
  )
}
