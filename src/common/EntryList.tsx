/**
 * An ordered list of text entries with "+" add, per-row remove and a paste box (one entry per non-empty line), the
 * same shape as the preset form's .env rows. Rows are plain text fields, or `TemplateEditor` rows when `preview` is
 * given. Rows keep a stable identity across add and remove, so editor state does not jump between rows.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { useState, type JSX } from 'react'
import TemplateEditor, { type TemplatePreview } from '../editor/TemplateEditor'

export interface EntryListProps {
  /** Singular noun for the rows, e.g. "Init script"; labels read "<label> 2", "Add <label lower-cased>". */
  label: string
  entries: string[]
  onChange: (entries: string[]) => void
  /** When set, each row is a template editor rendering through this preview. */
  preview?: (template: string) => Promise<TemplatePreview>
}

export default function EntryList({ label, entries, onChange, preview }: EntryListProps): JSX.Element {
  // row identities, with the next unused one; an outside reset of the list (different length) gets fresh identities
  const [keys, setKeys] = useState(() => ({ ids: entries.map((_, i) => i), next: entries.length }))
  const [pasteText, setPasteText] = useState<string | null>(null)
  let current = keys
  if (keys.ids.length !== entries.length) {
    current = { ids: entries.map((_, i) => keys.next + i), next: keys.next + entries.length }
    setKeys(current)
  }
  const lower = label.toLowerCase()

  const add = (items: string[]) => {
    setKeys({ ids: [...current.ids, ...items.map((_, i) => current.next + i)], next: current.next + items.length })
    onChange([...entries, ...items])
  }
  const remove = (i: number) => {
    setKeys({ ...current, ids: current.ids.filter((_, j) => j !== i) })
    onChange(entries.filter((_, j) => j !== i))
  }
  const edit = (i: number, value: string) => onChange(entries.map((e, j) => (j === i ? value : e)))
  const applyPaste = () => {
    const lines = (pasteText ?? '').split(/\r?\n/).filter((l) => l.trim() !== '')
    if (lines.length > 0) add(lines)
    setPasteText(null)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {entries.map((entry, i) => (
        <Box key={current.ids[i]} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <Box sx={{ flexGrow: 1 }}>
            {preview ? (
              <TemplateEditor label={`${label} ${i + 1}`} value={entry} onChange={(v) => edit(i, v)} preview={preview} />
            ) : (
              <TextField size="small" label={`${label} ${i + 1}`} value={entry} onChange={(e) => edit(i, e.target.value)} fullWidth />
            )}
          </Box>
          <IconButton size="small" aria-label={`Remove ${lower} ${i + 1}`} onClick={() => remove(i)}>
            x
          </IconButton>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" onClick={() => add([''])}>{`Add ${lower}`}</Button>
        <Button size="small" onClick={() => setPasteText('')} disabled={pasteText !== null}>{`Paste ${lower}`}</Button>
      </Box>
      {pasteText !== null && (
        <Box role="group" aria-label={`Paste ${lower}`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField size="small" label={`Paste ${lower} contents`} value={pasteText} onChange={(e) => setPasteText(e.target.value)} multiline minRows={3} fullWidth />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" onClick={applyPaste}>Apply paste</Button>
            <Button size="small" onClick={() => setPasteText(null)}>Cancel</Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
