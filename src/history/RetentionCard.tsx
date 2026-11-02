/** How long agents-history keeps discarded sessions, with the last sweep result. */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { getRetention, putRetention } from './api'
import type { RetentionView } from './api'

const MIN_DAYS = 1
const MAX_DAYS = 3650

/** The typed days as an integer in range, or undefined. */
const parseDays = (text: string) => {
  const days = Number(text)
  return text.trim() !== '' && Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS ? days : undefined
}

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

export function RetentionCard() {
  const [stored, setStored] = useState<RetentionView>()
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error>()

  useEffect(() => {
    let live = true
    getRetention().then(
      (view) => {
        if (!live) return
        setStored(view)
        setText(String(view.retention_days))
      },
      (e) => live && setError(asError(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const days = parseDays(text)
  const invalid = days === undefined
  const lowering = stored !== undefined && days !== undefined && days < stored.retention_days
  const canSave = stored !== undefined && !invalid && days !== stored.retention_days && !saving

  const save = async () => {
    if (days === undefined) return
    setSaving(true)
    setError(undefined)
    try {
      const view = await putRetention(days)
      setStored(view)
      setText(String(view.retention_days))
    } catch (e) {
      setError(asError(e))
    } finally {
      setConfirming(false)
      setSaving(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        {stored && <Typography sx={{ fontSize: TOKENS.fontSizes.lg }}>Keep {stored.retention_days} days</Typography>}
        {stored && (
          <Typography color="text.secondary" variant="body2">
            {stored.last_sweep_at
              ? `Last sweep: ${new Date(stored.last_sweep_at).toLocaleString()}, ${stored.last_sweep_deleted ?? 0} deleted`
              : 'No sweep yet'}
          </Typography>
        )}
      </Box>
      {stored && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <TextField
            size="small"
            type="number"
            label="Retention days"
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={invalid}
            helperText={invalid ? `Enter a whole number from ${MIN_DAYS} to ${MAX_DAYS}` : undefined}
            slotProps={{ htmlInput: { min: MIN_DAYS, max: MAX_DAYS, step: 1 } }}
          />
          <Button variant="contained" disabled={!canSave} onClick={() => (lowering ? setConfirming(true) : void save())}>Save</Button>
        </Box>
      )}
      <FormError error={error} />
      <ConfirmDialog
        open={confirming}
        title="Lower the retention?"
        body={`Sessions older than ${days} days will be deleted now.`}
        confirmLabel="Lower retention"
        confirmDisabled={saving}
        onConfirm={() => void save()}
        onCancel={() => setConfirming(false)}
      />
    </Paper>
  )
}
