import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import { Markdown } from '../markdown/Markdown'
import { FormError } from '../triggers'
import { acceptSuggestion, createComment, dismissSuggestion, resolveComment, type SpecComment } from './api'
import { VersionDiff } from './VersionDiff'

export interface CommentsProps {
  specKey: string
  path: string
  /** The document's newest version and body, as last fetched: what an Accept is posted against. */
  currentVersion: number
  currentBody: string
  comments: SpecComment[]
  /** Called after any change, and after a 412, so the page refetches. */
  onChanged: () => void
}

const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

function scrollToAnchor(anchor: string) {
  document.getElementById(`h-${anchor}`)?.scrollIntoView?.()
}

function CommentCard({ c, props }: { c: SpecComment; props: CommentsProps }) {
  const [error, setError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    setStale(false)
    try {
      await fn()
      props.onChanged()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale_version') {
        setStale(true)
        props.onChanged()
      } else setError(toError(e))
    }
  }
  const open = c.suggestion !== null && c.suggestion_status === 'open'
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, opacity: c.resolved_at ? 0.7 : 1 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          {`${c.created_by?.slug ?? c.created_by?.kind ?? 'unknown'} - ${new Date(c.created_at).toLocaleString()}`}
        </Typography>
        {c.version !== null && <Chip size="small" variant="outlined" label={`v${c.version}`} />}
        {c.anchor !== null && <Chip size="small" variant="outlined" label={`#${c.anchor}`} onClick={() => scrollToAnchor(c.anchor!)} />}
        {c.resolved_at && <Chip size="small" label="resolved" />}
        {c.suggestion !== null && c.suggestion_status && <Chip size="small" color={open ? 'warning' : 'default'} label={`suggestion ${c.suggestion_status}`} />}
      </Box>
      <Markdown>{c.body}</Markdown>
      {c.suggestion !== null && open && (
        <>
          <VersionDiff before={props.currentBody} after={c.suggestion} beforeLabel={`v${props.currentVersion}`} afterLabel="suggestion" />
          {stale && <Alert severity="warning">The document changed since you opened it; the diff shows the new version, review it and try again.</Alert>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" size="small" onClick={() => void act(() => acceptSuggestion(props.specKey, c.id, props.currentVersion))}>Accept</Button>
            <Button size="small" onClick={() => void act(() => dismissSuggestion(props.specKey, c.id))}>Dismiss</Button>
          </Box>
        </>
      )}
      <FormError error={error} />
      {!c.resolved_at && (
        <Box><Button size="small" onClick={() => void act(() => resolveComment(props.specKey, c.id))}>Resolve</Button></Box>
      )}
    </Paper>
  )
}

export function Comments(props: CommentsProps) {
  const [text, setText] = useState('')
  const [anchor, setAnchor] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const post = async () => {
    setError(null)
    try {
      await createComment(props.specKey, {
        body: text.trim(),
        path: props.path,
        version: props.currentVersion,
        ...(anchor.trim() !== '' ? { anchor: anchor.trim() } : {}),
        ...(suggestion !== null ? { suggestion } : {}),
      })
      setText('')
      setAnchor('')
      setSuggestion(null)
      props.onChanged()
    } catch (e) {
      setError(toError(e))
    }
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {props.comments.length === 0 && <Typography color="text.secondary">No comments</Typography>}
      {props.comments.map((c) => (
        <CommentCard key={c.id} c={c} props={props} />
      ))}
      <FormError error={error} />
      <TextField size="small" multiline label="Add a comment" value={text} onChange={(e) => setText(e.target.value)} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" label="Heading id" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        <Button size="small" onClick={() => setSuggestion(suggestion === null ? props.currentBody : null)}>
          {suggestion === null ? 'Suggest an edit' : 'Drop suggestion'}
        </Button>
        <Button variant="contained" disabled={text.trim() === ''} onClick={() => void post()}>Comment</Button>
      </Box>
      {suggestion !== null && <TextField multiline minRows={4} label="Proposed document" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />}
    </Box>
  )
}
