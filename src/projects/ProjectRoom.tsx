/** Read-only view of a project's chat room (leader posts, newest last). */
import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { listProjectMessages } from './api'
import type { ProjectPost } from './api'

const ROOM_POLL_MS = 10_000
const PAGE = 50

/** Merge by id, ascending (the server pages newest first, polls oldest first). */
const merge = (a: ProjectPost[], b: ProjectPost[]) => {
  const byId = new Map<number, ProjectPost>()
  for (const p of [...a, ...b]) byId.set(p.id, p)
  return [...byId.values()].sort((x, y) => x.id - y.id)
}

export function ProjectRoom({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [posts, setPosts] = useState<ProjectPost[]>([])
  const [olderBefore, setOlderBefore] = useState<number | null>(null)
  const [olderError, setOlderError] = useState<Error | null>(null)
  const newest = useRef<number | undefined>(undefined)

  const apply = (incoming: ProjectPost[]) => {
    setPosts((cur) => {
      const next = merge(cur, incoming)
      newest.current = next.length ? next[next.length - 1].id : undefined
      return next
    })
  }
  const { error } = usePoll(async () => {
    if (newest.current === undefined) {
      const page = await listProjectMessages(slug, { limit: PAGE })
      apply(page.posts)
      setOlderBefore(page.next_before_id)
    } else {
      apply((await listProjectMessages(slug, { afterId: newest.current })).posts)
    }
  }, ROOM_POLL_MS, [slug])

  const loadOlder = async () => {
    if (olderBefore === null) return
    setOlderError(null)
    try {
      const page = await listProjectMessages(slug, { beforeId: olderBefore, limit: PAGE })
      apply(page.posts)
      setOlderBefore(page.next_before_id)
    } catch (e) {
      setOlderError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 520 }, display: 'flex', flexDirection: 'column', gap: 1, p: 2, minHeight: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="h2" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>Room: {slug}</Typography>
          <Button onClick={onClose}>Close</Button>
        </Box>
        <FormError error={error ?? null} />
        <FormError error={olderError} />
        {olderBefore !== null && <Button size="small" onClick={() => void loadOlder()}>Older</Button>}
        {posts.length === 0 && !error && <Typography color="text.secondary">No posts in this room yet.</Typography>}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
          {posts.map((p) => (
            <Box component="li" key={p.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Link component={RouterLink} to={`/?session=${p.sender_session_id}`}>{p.from}</Link>
                {p.sender_kind === 'superleader' && <Chip size="small" color="primary" label="superleader" />}
                <Typography variant="caption" color="text.secondary">{new Date(p.at).toLocaleString()}</Typography>
                {p.to.map((t) => <Chip key={t} size="small" variant="outlined" label={t} />)}
              </Box>
              {p.reply_to !== null && <Typography variant="caption" color="text.secondary" component="div">{`reply to p${p.reply_to}`}</Typography>}
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.text}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Drawer>
  )
}
