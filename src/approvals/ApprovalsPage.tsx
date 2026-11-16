import { useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { FormError } from '../triggers'
import { taskPath } from '../tasks/paths'
import { ApprovalCard } from './ApprovalCard'
import { answerApprovals, listApprovals, type Approval, type ApprovalResult } from './api'

const RESULT_TEXT: Record<ApprovalResult, string> = {
  answered: 'Answered',
  already_answered: 'Already answered',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  not_found: 'Not found',
}

const asker = (a: Approval) => a.asking_slug ?? a.asking_session

/** Open approvals grouped by asker, answered one by one or in bulk with Go selected and Go all. */
export function ApprovalsPage() {
  const [items, setItems] = useState<Approval[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [results, setResults] = useState<{ id: number; result: ApprovalResult }[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await listApprovals({ status: 'open' })
      setItems(r.items)
      setSelected((prev) => new Set(r.items.filter((a) => prev.has(a.id)).map((a) => a.id)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the open approvals on mount
    void load()
  }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, Approval[]>()
    for (const a of items ?? []) m.set(asker(a), [...(m.get(asker(a)) ?? []), a])
    return [...m.entries()].sort(([x], [y]) => x.localeCompare(y))
  }, [items])

  const goAll = async (ids: number[]) => {
    setBusy(true)
    setError(null)
    try {
      const r = await answerApprovals(ids.map((id) => ({ id, verdict: 'go' as const })))
      setResults(r.items.map((i) => ({ id: i.id, result: i.result })))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const all = items ?? []
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Approvals</Typography>
        <Button variant="contained" disabled={busy || selected.size === 0} onClick={() => void goAll([...selected])}>{`Go selected (${selected.size})`}</Button>
        <Button variant="outlined" disabled={busy || all.length === 0} onClick={() => void goAll(all.map((a) => a.id))}>{`Go all (${all.length})`}</Button>
      </Box>
      <FormError error={error} />
      {items !== null && items.length === 0 && <Typography color="text.secondary">No open approvals</Typography>}
      {results.length > 0 && (
        <Box>
          <Typography variant="subtitle2">Results</Typography>
          {results.map((r) => (
            <Typography key={r.id}>{`D-${r.id}: ${RESULT_TEXT[r.result]}`}</Typography>
          ))}
        </Box>
      )}
      {groups.map(([name, list]) => (
        <Box key={name} component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle1" component="h2">{`${name} (${list.length})`}</Typography>
          {list.map((a) => (
            <Box key={a.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <FormControlLabel control={<Checkbox checked={selected.has(a.id)} onChange={() => toggle(a.id)} />} label={`D-${a.id}`} />
                <Link component={RouterLink} to={taskPath(a.task_key)}>{a.task_title}</Link>
              </Box>
              <ApprovalCard taskKey={a.task_key} decision={a} onChanged={() => void load()} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}
