/** Review dialog for one change proposal: header, item cards, revision history and the review footer. */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useState, type JSX } from 'react'
import { ApiError } from '../api/client'
import { formatAge, useNow } from '../chat/agentAge'
import { FormError } from '../triggers'
import { getProposal, reviewProposal, type ProposalView, type ReviewItemIn } from './api'
import { ItemCard, type Choice } from './ItemCard'
import { viewedKey } from './viewed'
import { useVaultEntries } from '../vault/useVaultEntries'
import { RevisionHistory } from './RevisionHistory'
import { changedPaths, orderItems } from './revisions'

export interface ProposalReviewDialogProps {
  proposal: ProposalView
  onClose: () => void
  /** Called with the server's view after a submit or a refetch. */
  onChanged?: (p: ProposalView) => void
  /** Opens the Schedules page; offered for schedule proposals only. */
  onOpenSchedule?: () => void
  /** Selects the target session in the app; offered for session proposals only. */
  onOpenSession?: (id: string) => void
}

interface Entry {
  decision: Choice
  note: string
}

export function ProposalReviewDialog({ proposal, onClose, onChanged, onOpenSchedule, onOpenSession }: ProposalReviewDialogProps): JSX.Element {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))
  const now = useNow()
  const { byId } = useVaultEntries()
  const [view, setView] = useState(proposal)
  // choices belong to one revision; a newer revision starts clean
  const [choices, setChoices] = useState<{ revision: number; map: Partial<Record<string, Entry>> }>({ revision: proposal.revision, map: {} })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [submitted, setSubmitted] = useState<ProposalView | null>(null)

  // the list endpoint carries only the current revision; the full view adds the earlier ones (history,
  // changed chips). It replaces the view only while nothing newer (a submit or a refetch) has landed.
  useEffect(() => {
    let live = true
    getProposal(proposal.id).then(
      (full) => {
        if (live) setView((cur) => (cur === proposal ? full : cur))
      },
      // the list view stays usable without its history
      () => {},
    )
    return () => {
      live = false
    }
  }, [proposal])

  const current = view.revisions.find((r) => r.revision === view.revision) ?? view.revisions[view.revisions.length - 1]
  const previous = view.revisions.find((r) => r.revision === view.revision - 1)
  const earlier = view.revisions.filter((r) => r.revision < view.revision)
  const stale = view.status === 'stale' || view.stale
  // a stale proposal cannot be approved: approvals are dropped so Submit needs a Rework or Deny per item
  const map: Partial<Record<string, Entry>> = Object.fromEntries(
    Object.entries(choices.revision === view.revision ? choices.map : {}).filter(([, e]) => !stale || e?.decision !== 'approve'),
  )
  const readOnly = (view.status !== 'open' && view.status !== 'stale') || submitted !== null
  const items = orderItems(current?.items ?? [])
  const changed = current ? changedPaths(current, previous) : new Set<string>()

  const setEntry = (path: string, patch: Partial<Entry>) =>
    setChoices({ revision: view.revision, map: { ...map, [path]: { decision: 'approve', note: '', ...map[path], ...patch } } })
  const decided = items.every((i) => map[i.path])
  const reworking = items.some((i) => map[i.path]?.decision === 'rework')
  const complete = decided && items.every((i) => map[i.path]?.decision !== 'rework' || map[i.path]?.note.trim() !== '')

  const adopt = (p: ProposalView) => {
    setView(p)
    onChanged?.(p)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    // Submit is enabled only when every item is decided
    const body: ReviewItemIn[] = items.map((i) => {
      const e = map[i.path] as Entry
      const note = e.decision === 'approve' ? '' : e.note.trim()
      return note ? { path: i.path, decision: e.decision, note } : { path: i.path, decision: e.decision }
    })
    try {
      const next = await reviewProposal(view.id, { revision: view.revision, items: body })
      adopt(next)
      setSubmitted(next)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.code === 'proposal_stale' || e.code === 'revision_changed')) {
        try {
          adopt(await getProposal(view.id))
        } catch (e2) {
          setError(e2)
        }
      } else {
        setError(e)
      }
    } finally {
      setBusy(false)
    }
  }

  const counts = (['approve', 'rework', 'deny'] as const).map((d) => `${items.filter((i) => map[i.path]?.decision === d).length} ${d}`).join(', ')

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xl" aria-labelledby="proposal-review-title">
      <DialogTitle id="proposal-review-title">
        {view.kind} {view.target_name}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {`proposed by ${view.proposer_slug}${view.proposer_superleader ? ' (superleader)' : ''} - r${view.revision} of ${view.revision} - ${formatAge(now - Date.parse(view.created_at))} ago - expires ${new Date(view.expires_at).toLocaleString()}`}
        </Typography>
        {view.kind === 'schedule' && onOpenSchedule && (
          <Box>
            <Button size="small" onClick={onOpenSchedule}>Open schedules</Button>
          </Box>
        )}
        {view.kind === 'session' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {!view.proposer_superleader && <Chip size="small" color="warning" label="leader of its own session" />}
            {onOpenSession && <Button size="small" onClick={() => onOpenSession(view.target_id)}>Open session</Button>}
          </Box>
        )}
        {current && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current.reason}</Typography>}
        {stale && <Alert severity="warning">stale: the target changed since this revision. Only Rework and Deny are offered.</Alert>}
        {submitted && <Alert severity="success">{`Review submitted: ${counts}.`}</Alert>}
        <FormError error={error as Error | null} />
        {items.map((i) => (
          <ItemCard
            key={`${view.revision}:${i.path}`}
            item={i}
            entries={byId}
            kind={view.kind}
            choice={map[i.path]?.decision}
            note={map[i.path]?.note ?? ''}
            readOnly={readOnly}
            stale={stale}
            changed={changed.has(i.path)}
            previous={previous?.revision}
            viewKey={viewedKey(view.id, view.revision, i.path)}
            onChoice={(decision) => setEntry(i.path, { decision })}
            onNote={(note) => setEntry(i.path, { note })}
          />
        ))}
        <RevisionHistory revisions={earlier} />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {!readOnly && reworking && (
          <Box sx={{ flexBasis: '100%' }}>
            <Typography variant="caption">nothing is applied until the agent revises</Typography>
          </Box>
        )}
        {!readOnly && !stale && (
          <Button
            disabled={busy}
            onClick={() => setChoices({ revision: view.revision, map: Object.fromEntries(items.map((i) => [i.path, { decision: 'approve' as Choice, note: '' }])) })}
          >
            Approve all
          </Button>
        )}
        {!readOnly && (
          <Button variant="contained" disabled={!complete || busy} onClick={() => void submit()}>
            {reworking ? 'Request rework' : 'Submit review'}
          </Button>
        )}
        <Button onClick={onClose}>{readOnly ? 'Close' : 'Later'}</Button>
      </DialogActions>
    </Dialog>
  )
}
