/** Settings > Sessions: every session with its state and autoclose time left; open, new and discard; an empty state when there is none. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { listSessions } from '../api/client'
import type { SessionView } from '../api/client'
import { TOKENS } from '../theme'
import { DiscardSessionDialog } from './DiscardSessionDialog'
import { NewSessionDialog } from './NewSessionDialog'

export interface SessionsPageProps {
  onBack: () => void
  /** Selects the session and returns to its workspace. */
  onOpen: (sessionId: string) => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Autoclose time left: "never" without a deadline, "closing" once it has passed. */
export function timeLeft(closesAt: string | null, now = Date.now()): string {
  if (closesAt === null) return 'never'
  const minutes = Math.floor((new Date(closesAt).getTime() - now) / 60_000)
  if (minutes < 1) return 'closing'
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return `${d > 0 ? `${d}d ` : ''}${d > 0 || h > 0 ? `${h}h ` : ''}${m}m left`
}

export function SessionsPage({ onBack, onOpen }: SessionsPageProps) {
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [creating, setCreating] = useState(false)
  const [discarding, setDiscarding] = useState<SessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Bumped after every create or discard; the effect below refetches the list.
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    listSessions()
      .then((list) => {
        if (cancelled) return
        setSessions([...list].sort((a, b) => a.slug.localeCompare(b.slug)))
        setError(null)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(message(e))
      })
    return () => {
      cancelled = true
    }
  }, [version])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Sessions</Typography>
        <Button variant="outlined" onClick={() => setCreating(true)}>New session</Button>
      </Box>
      {error && <Alert severity="error" variant="outlined">{error}</Alert>}
      {loaded && !error && sessions.length === 0 && <Typography color="text.secondary">No sessions yet</Typography>}
      <List disablePadding>
        {sessions.map((c) => (
          <ListItem
            key={c.id}
            divider
            secondaryAction={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" aria-label={`Open ${c.slug}`} onClick={() => onOpen(c.id)}>Open</Button>
                <Button size="small" color="error" aria-label={`Discard ${c.slug}`} onClick={() => setDiscarding(c)}>Discard</Button>
              </Box>
            }
          >
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'baseline', pr: 20 }}>
              <ListItemText primary={c.slug} sx={{ minWidth: 120 }} />
              <Typography component="span">{c.preset_name ?? 'none'}</Typography>
              <Typography component="span">{c.summary.state}</Typography>
              <Typography component="span">{`${c.summary.ready}/${c.summary.replicas}`}</Typography>
              <Typography component="span">{new Date(c.created_at).toLocaleString()}</Typography>
              <Typography component="span">{timeLeft(c.closes_at)}</Typography>
            </Box>
          </ListItem>
        ))}
      </List>
      <NewSessionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          reload()
        }}
      />
      {discarding && (
        <DiscardSessionDialog
          open
          session={discarding}
          onClose={() => setDiscarding(null)}
          onDiscarded={() => {
            setDiscarding(null)
            reload()
          }}
        />
      )}
    </Box>
  )
}
