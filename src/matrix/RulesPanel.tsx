/** The allow and deny lists: every rule with a delete action, and a form to add one. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import TemplateEditor from '../editor/TemplateEditor'
import { FormError, usePoll } from '../triggers'
import { addRule, deleteRule, listRules } from './api'
import { connectorPreview } from './PreamblePanel'
import type { MatrixMeta, RuleView } from './api'

const LISTS = ['allow', 'deny']

export function RulesPanel({ meta }: { meta: MatrixMeta | undefined }) {
  const [list, setList] = useState('allow')
  const [kind, setKind] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [preamble, setPreamble] = useState('')
  const [error, setError] = useState<Error>()
  const [removing, setRemoving] = useState<RuleView | null>(null)
  const { data: rules, error: loadError, refresh } = usePoll(listRules, 5000, [])

  const kinds = meta?.rule_kinds[list] ?? []
  const loaded = rules !== undefined && rules !== null && !loadError
  const fail = (e: unknown) => setError(e instanceof Error ? e : new Error(String(e)))

  const changeList = (next: string) => {
    setList(next)
    if (!(meta?.rule_kinds[next] ?? []).includes(kind)) setKind('')
  }

  const add = async () => {
    setError(undefined)
    try {
      await addRule({ list, kind, value: value.trim(), ...(note.trim() ? { note: note.trim() } : {}), ...(preamble.trim() ? { preamble } : {}) })
      setValue('')
      setNote('')
      setPreamble('')
      await refresh()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async () => {
    const rule = removing
    setRemoving(null)
    if (!rule) return
    setError(undefined)
    try {
      await deleteRule(rule.id)
      await refresh()
    } catch (e) {
      fail(e)
    }
  }

  const section = (name: string, items: RuleView[]) => (
    <Box key={name} component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="h3" variant="subtitle1">{name === 'allow' ? 'Allow list' : 'Deny list'}</Typography>
      <Table size="small" aria-label={`${name} rules`}>
        <TableHead>
          <TableRow>{['Kind', 'Value', 'Note', 'Preamble', 'Created', ''].map((h, i) => <TableCell key={i}>{h}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.kind}</TableCell>
              <TableCell>{r.value}</TableCell>
              <TableCell>{r.note}</TableCell>
              <TableCell>{r.preamble ? 'custom' : 'default'}</TableCell>
              <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell><Button size="small" color="error" onClick={() => setRemoving(r)}>Delete</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {loaded && items.length === 0 && <Typography color="text.secondary">No rules.</Typography>}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormError error={loadError ?? error} />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField select size="small" label="List" value={list} onChange={(e) => changeList(e.target.value)} sx={{ minWidth: 120 }}>
          {LISTS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} sx={{ minWidth: 160 }}>
          {kinds.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="contained" disabled={!loaded || !kind || !value.trim()} onClick={() => void add()}>Add rule</Button>
      </Box>
      <Box sx={{ maxWidth: 720 }}>
        <TemplateEditor
          label="Preamble override (empty uses the global preamble)" value={preamble} onChange={setPreamble}
          preview={connectorPreview({ rule_name: note.trim() })} previewLabel="Preview override"
        />
      </Box>
      {section('allow', rules?.allow ?? [])}
      {section('deny', rules?.deny ?? [])}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this rule?"
        body={removing ? `Removes the ${removing.list} rule ${removing.kind}: ${removing.value}.` : undefined}
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Box>
  )
}
