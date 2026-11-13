/** "Mind map" section of the task view: the maps and nodes linked to a task (`GET /links?key=T-n`). Renders only when the mindmap backend is configured. */
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { mapPath } from '../mindmap/paths'
import { listLinks, mindmapEnabled } from '../mindmap/api'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'

const POLL_MS = 10000

function Panel({ taskKey }: { taskKey: string }) {
  const { data: links, error } = usePoll(() => listLinks(taskKey), POLL_MS, [taskKey])
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md, fontWeight: 500 }}>Mind map</Typography>
      <FormError error={error} />
      {links?.length === 0 && <Typography color="text.secondary">No mind map is linked to this task</Typography>}
      <List dense disablePadding>
        {(links ?? []).map((l) => (
          <ListItem key={l.id} disableGutters sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Link component={RouterLink} to={mapPath(l.map, l.node ? { node: l.node } : {})}>{l.node ? `${l.node} in ${l.map}` : l.map}</Link>
            <Chip size="small" label={l.relation.replace(/_/g, ' ')} />
            <Typography color="text.secondary">{l.project}</Typography>
          </ListItem>
        ))}
      </List>
    </Box>
  )
}

export function MindmapLinksPanel({ taskKey }: { taskKey: string }) {
  return mindmapEnabled() ? <Panel taskKey={taskKey} /> : null
}
