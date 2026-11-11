import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { LabelChips } from '../labels/LabelChips'
import { LabelEditor } from '../labels/LabelEditor'
import { useProject } from '../projects/ProjectContext'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { listSpecs, type SpecSummary, type SpecPage, type SpecStatus } from './api'
import { specPath } from './paths'
import { useSpecStream } from './useSpecStream'

const POLL_MS = 10000
type Filter = SpecStatus | 'all'
const STATUSES: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
]

function asStatus(raw: string | null): Filter {
  return STATUSES.some((s) => s.value === raw) ? (raw as Filter) : 'all'
}

export function SpecsPage() {
  const [params, setParams] = useSearchParams()
  const status = asStatus(params.get('status'))
  const name = params.get('name') ?? ''
  const labels = params.getAll('label')
  const { project } = useProject()
  const query = { status: status === 'all' ? undefined : status, name: name || undefined, project, labels }

  const { data, error, loading, refresh } = usePoll(() => listSpecs(query), POLL_MS, [status, name, project, labels.join('\n')])
  useSpecStream(() => void refresh())

  // Further pages are appended to the first one; a poll or a filter change starts over.
  const [extra, setExtra] = useState<{ page: SpecPage | undefined; items: SpecSummary[]; next: string | null } | null>(null)
  const more = extra !== null && extra.page === data ? extra : null
  const items = [...(data?.items ?? []), ...(more?.items ?? [])]
  const next = more ? more.next : (data?.next_cursor ?? null)
  const loadMore = async () => {
    if (next === null) return
    const page = await listSpecs({ ...query, cursor: next })
    setExtra({ page: data, items: [...(more?.items ?? []), ...page.items], next: page.next_cursor })
  }

  const update = (edit: (p: URLSearchParams) => void) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      edit(p)
      return p
    }, { replace: true })
  const setLabels = (next: string[]) =>
    update((p) => {
      p.delete('label')
      for (const l of next) p.append('label', l)
    })
  const addLabel = (label: string) => {
    if (!labels.includes(label)) setLabels([...labels, label])
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button component={RouterLink} to="/">Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Specs</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          aria-label="Status"
          value={status}
          onChange={(_, v: Filter | null) => v !== null && update((p) => (v === 'all' ? p.delete('status') : p.set('status', v)))}
        >
          {STATUSES.map((s) => (
            <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField size="small" label="Name" value={name} onChange={(e) => update((p) => (e.target.value === '' ? p.delete('name') : p.set('name', e.target.value)))} />
        <Box sx={{ minWidth: 240, flexGrow: 1 }}>
          <LabelEditor value={labels} onChange={setLabels} />
        </Box>
      </Box>
      <FormError error={error} />
      <Table size="small" aria-label="Specs">
        <TableHead>
          <TableRow>
            <TableCell>Key</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Project</TableCell>
            <TableCell>Labels</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((s) => (
            <TableRow key={s.key} hover>
              <TableCell><Link component={RouterLink} to={specPath(s.key)}>{s.key}</Link></TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell>{s.title}</TableCell>
              <TableCell><Chip size="small" label={s.status} /></TableCell>
              <TableCell><Chip size="small" variant="outlined" label={s.project} /></TableCell>
              <TableCell><LabelChips labels={s.labels} onClick={addLabel} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!loading && items.length === 0 && !error && <Typography color="text.secondary">No specs</Typography>}
      {next !== null && <Box><Button onClick={() => void loadMore()}>Load more</Button></Box>}
    </Box>
  )
}
