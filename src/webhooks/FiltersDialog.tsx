/**
 * Edit an existing endpoint's allow/deny filters (PUT /endpoints/{id}/filters), with an example JSON
 * checked against them first. Mount it only with the type's loaded `fields`: the editor drops every
 * rule whose field is not listed, so an empty or unloaded list would erase the stored rules on save.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import { previewTemplate, setEndpointFilters } from './api'
import type { EndpointView, FilterResult, Filters } from './api'
import { FiltersEditor } from './FiltersEditor'
import { sampleFor } from './samples'

export interface FiltersDialogProps {
  endpoint: EndpointView
  fields: string[]
  open: boolean
  onClose: () => void
  onSaved: (updated: EndpointView) => void
}

/** Mounted only while open, so every opening starts from the endpoint's saved rules. */
function Body({ endpoint, fields, onClose, onSaved }: Omit<FiltersDialogProps, 'open'>) {
  const [filters, setFilters] = useState<Filters>(endpoint.filters)
  const [example, setExample] = useState(sampleFor(endpoint.type))
  const [result, setResult] = useState<FilterResult | null>(null)
  const [checkError, setCheckError] = useState<unknown>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const edit = (next: Filters) => { setFilters(next); setResult(null) }

  const check = async () => {
    setResult(null)
    setCheckError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(example)
    } catch {
      setCheckError('Example JSON is not valid JSON')
      return
    }
    try {
      setResult((await previewTemplate({ type: endpoint.type, example: parsed, filters })).filters)
    } catch (e) {
      setCheckError(e)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await setEndpointFilters(String(endpoint.id), filters))
      onClose()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <>
      <DialogTitle>Filters</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
          {endpoint.url} ({endpoint.type})
        </Typography>
        <FiltersEditor type={endpoint.type} fields={fields} value={filters} onChange={edit} />
        <TextField
          label="Example JSON" multiline minRows={4} value={example}
          onChange={(e) => { setExample(e.target.value); setResult(null) }}
          helperText="A sample webhook payload to check whether it passes the filters"
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace' } } }} fullWidth
        />
        <Box>
          <Button variant="outlined" onClick={() => void check()}>Check</Button>
        </Box>
        <FormError error={checkError as never} />
        {result && (
          <Typography variant="body2" color={result.passed ? 'success.main' : 'warning.main'}>
            {result.passed ? 'Passes the filters' : `Ignored: ${result.reason ?? 'filtered out'}`}
          </Typography>
        )}
        <FormError error={error as never} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy}>Save</Button>
      </DialogActions>
    </>
  )
}

export function FiltersDialog({ endpoint, fields, open, onClose, onSaved }: FiltersDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <Body endpoint={endpoint} fields={fields} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}
