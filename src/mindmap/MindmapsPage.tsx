/**
 * The Mindmaps page: project selector and map list (left), the graph (centre) and the node panel (right). On a phone the
 * page scrolls as one column: the map list collapses behind a toggle, the graph takes 70dvh, the node panel opens in a
 * bottom drawer and the map actions sit in a More menu.
 */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { safeArea } from '../layout/safeArea'
import { useLayout } from '../layout/useLayout'
import { useProject } from '../projects/ProjectContext'
import { FormError } from '../triggers'
import { getGraph, getMap, listDirections, listMaps, listProjects, mindmapEnabled } from './api'
import type { MapView, NodeStub, ProjectCount, Subgraph } from './api'
import { DirectionDialog } from './DirectionDialog'
import { DirectionsTab } from './DirectionsTab'
import { ArchiveDialog, DeleteDialog, LinkDialog, MapDialog, NodeDialog } from './EditDialogs'
import { GraphView } from './GraphView'
import { countDescendants } from './graphLayout'
import type { Direction } from './graphLayout'
import { MapLinks } from './MapLinks'
import { NodePanel } from './NodePanel'
import { mapPath } from './paths'
import { SearchBox } from './SearchBox'
import { useMindmapStream } from './useMindmapStream'

/** Nodes of the map in the loaded graph (stubs of other maps excluded); the graph is depth-limited, so a truncated one says "at least". */
const nodeCount = (g: Subgraph, mapKey: string): string => {
  const n = g.nodes.filter((x) => x.map === mapKey && !x.stub).length
  return `${g.truncated ? 'at least ' : ''}${n} ${n === 1 ? 'node' : 'nodes'}`
}

type MapTab = 'graph' | 'directions' | 'links'
type Dialog = 'new-map' | 'edit-map' | 'archive-map' | 'delete-map' | 'link-map' | 'new-node' | 'direction-map'

/** Toolbar actions of an open map, in order: buttons on md+, the More menu on a phone. */
const MAP_ACTIONS: { label: string; dialog: Dialog; color?: 'error' }[] = [
  { label: 'Add node', dialog: 'new-node' },
  { label: 'Edit map', dialog: 'edit-map' },
  { label: 'Link', dialog: 'link-map' },
  { label: 'Send direction', dialog: 'direction-map' },
  { label: 'Archive', dialog: 'archive-map' },
  { label: 'Delete', dialog: 'delete-map', color: 'error' },
]

export function MindmapsPage() {
  const { mapKey } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const nodeKey = params.get('node')
  // The phone drawer keeps the last node through its exit transition instead of sliding out empty.
  const [drawerKey, setDrawerKey] = useState(nodeKey)
  if (nodeKey !== null && nodeKey !== drawerKey) setDrawerKey(nodeKey)
  const directionKey = params.get('direction')
  const globalProject = useProject().project
  const [projects, setProjects] = useState<ProjectCount[]>([])
  const [project, setProject] = useState<string | null>(globalProject)
  const [maps, setMaps] = useState<MapView[]>([])
  const [openDirections, setOpenDirections] = useState<Map<string, number>>(new Map())
  const [map, setMap] = useState<MapView>()
  const [graph, setGraph] = useState<Subgraph>()
  const [dir, setDir] = useState<Direction>('TB')
  const [error, setError] = useState<unknown>()
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState<Dialog>()
  const [pickedTab, setPickedTab] = useState<MapTab>('graph')
  const phone = useLayout() === 'phone'
  const [navOpen, setNavOpen] = useState(false)
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const reload = useCallback(() => setRefresh((n) => n + 1), [])
  const enabled = mindmapEnabled()

  useMindmapStream(enabled ? (map?.project ?? project) : null, reload)

  useEffect(() => {
    if (!enabled) return
    listProjects().then(setProjects, setError)
  }, [enabled, refresh])
  useEffect(() => {
    if (!enabled) return
    listMaps({ project }).then((m) => { setMaps(m); setError(undefined) }, setError)
  }, [enabled, project, refresh])
  useEffect(() => {
    if (!enabled) return
    listDirections({ project, status: 'open' }).then((ds) => {
      const counts = new Map<string, number>()
      for (const d of ds) counts.set(d.map, (counts.get(d.map) ?? 0) + 1)
      setOpenDirections(counts)
    }, setError)
  }, [enabled, project, refresh])
  useEffect(() => {
    if (!enabled || !mapKey) return
    let live = true
    Promise.all([getMap(mapKey), getGraph(mapKey)]).then(
      ([m, g]) => { if (live) { setMap(m); setGraph(g); setError(undefined) } },
      (e: unknown) => { if (live) setError(e) },
    )
    return () => { live = false }
  }, [enabled, mapKey, refresh])

  const select = (n: NodeStub) => navigate(mapPath(n.map, { node: n.key }))
  const openNode = (key: string) => navigate(mapPath(mapKey, { node: key, direction: directionKey ?? undefined }))
  /** `?direction=` always shows the directions tab; picking Graph drops it from the URL. */
  const tab = directionKey ? 'directions' : pickedTab
  const pickTab = (t: MapTab) => {
    setPickedTab(t)
    if (t === 'graph' && directionKey) navigate(mapPath(mapKey, { node: nodeKey ?? undefined }))
  }
  const closeDialog = () => setDialog(undefined)
  const saved = () => { closeDialog(); reload() }

  if (!enabled) return <Typography color="text.secondary">The mindmap backend is not configured</Typography>
  const closeNode = () => navigate(mapPath(mapKey, { direction: directionKey ?? undefined }))
  const selectedNode = nodeKey !== null && graph?.nodes.some((n) => n.key === nodeKey) ? nodeKey : null

  const panelFor = (key: string) => (
    <NodePanel
      key={key}
      nodeKey={key}
      mapKey={mapKey}
      onOpenMap={(m, k) => navigate(mapPath(m, { node: k }))}
      refreshKey={refresh}
      onChanged={reload}
      onDeleted={() => { navigate(mapPath(mapKey)); reload() }}
      onOpenNode={openNode}
      descendants={graph?.nodes.some((n) => n.key === key) ? countDescendants(graph.nodes, key) : undefined}
    />
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button component={RouterLink} to="/">Back</Button>
        <Typography variant="h6" component="h1">Mindmaps</Typography>
      </Stack>
      <FormError error={error instanceof Error ? error : undefined} />
      <Box data-testid="mindmaps-body" sx={{ display: 'flex', flexGrow: 1, minHeight: 0, gap: 1, flexDirection: { xs: 'column', md: 'row' }, overflow: phone ? 'auto' : undefined }}>
        {phone && (
          <Button variant="outlined" aria-expanded={navOpen} aria-controls="mindmaps-nav" onClick={() => setNavOpen((o) => !o)} sx={{ flexShrink: 0, justifyContent: 'flex-start' }}>
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`Maps: ${map && map.key === mapKey ? map.title : 'pick a map'}`}</Box>
          </Button>
        )}
        {(!phone || navOpen) && (
        <Paper id="mindmaps-nav" variant="outlined" component="nav" aria-label="Maps" sx={{ width: { md: 260 }, flexShrink: 0, p: 1, overflow: 'auto', maxHeight: phone ? '40dvh' : { xs: 220, md: 'none' } }}>
          <TextField select size="small" fullWidth label="Project" value={project ?? ''} onChange={(e) => setProject(e.target.value || null)}>
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.project} value={p.project}>{`${p.project} (${p.maps})`}</MenuItem>)}
          </TextField>
          <Box sx={{ mt: 1 }}>
            <SearchBox project={project} onOpen={(h) => navigate(mapPath(h.map, { node: h.key }))} />
          </Box>
          <Button fullWidth size="small" sx={{ my: 1 }} onClick={() => setDialog('new-map')}>New map</Button>
          <List dense disablePadding>
            {maps.map((m) => (
              <ListItemButton key={m.key} selected={m.key === mapKey} component={RouterLink} to={mapPath(m.key)} onClick={() => setNavOpen(false)}>
                <ListItemText primary={m.title} secondary={`${m.key} - ${m.project}${m.key === map?.key && graph ? ` - ${nodeCount(graph, m.key)}` : ''}`} />
                {(openDirections.get(m.key) ?? 0) > 0 && <Chip size="small" color="warning" sx={{ mr: 0.5 }} label={`${openDirections.get(m.key)} open ${openDirections.get(m.key) === 1 ? 'direction' : 'directions'}`} />}
                <Chip size="small" label={m.kind} />
                {m.status === 'archived' && <Chip size="small" label="archived" sx={{ ml: 0.5 }} />}
              </ListItemButton>
            ))}
            {maps.length === 0 && <Typography color="text.secondary" sx={{ p: 1 }}>No maps</Typography>}
          </List>
        </Paper>
        )}

        <Paper variant="outlined" component="section" aria-label="Graph" sx={{ ...(phone ? { height: '70dvh', flexShrink: 0 } : { flexGrow: 1 }), minWidth: 0, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          {mapKey && map?.key === mapKey && graph ? (
            <>
              <Stack direction="row" spacing={1} useFlexGap sx={{ p: 1, borderBottom: 1, borderColor: 'divider', alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 500 }}>{map.title}</Typography>
                <Chip size="small" label={map.status} />
                <ToggleButtonGroup size="small" exclusive value={dir} onChange={(_, v: Direction | null) => v && setDir(v)} aria-label="Layout direction">
                  <ToggleButton value="TB">Top-down</ToggleButton>
                  <ToggleButton value="LR">Left-right</ToggleButton>
                </ToggleButtonGroup>
                {phone ? (
                  <>
                    <IconButton aria-label="More map actions" aria-haspopup="menu" onClick={(e) => setMoreAnchor(e.currentTarget)} sx={{ ml: 'auto' }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={moreAnchor} open={moreAnchor !== null} onClose={() => setMoreAnchor(null)}>
                      {MAP_ACTIONS.map((a) => (
                        <MenuItem key={a.dialog} sx={a.color ? { color: 'error.main' } : undefined} onClick={() => { setMoreAnchor(null); setDialog(a.dialog) }}>{a.label}</MenuItem>
                      ))}
                    </Menu>
                  </>
                ) : (
                  MAP_ACTIONS.map((a) => <Button key={a.dialog} size="small" color={a.color} onClick={() => setDialog(a.dialog)}>{a.label}</Button>)
                )}
              </Stack>
              <Tabs value={tab} onChange={(_, v: MapTab) => pickTab(v)} aria-label="Map views" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="graph" label="Graph" />
                <Tab value="directions" label="Directions" />
                <Tab value="links" label="Links" />
              </Tabs>
              {tab === 'graph' ? (
                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                  <GraphView graph={graph} dir={dir} selected={selectedNode} onSelect={select} onChanged={reload} />
                </Box>
              ) : tab === 'links' ? (
                <MapLinks mapKey={map.key} refreshKey={refresh} onChanged={reload} />
              ) : (
                <DirectionsTab mapKey={map.key} refreshKey={refresh} selected={directionKey} onOpenNode={openNode} onChanged={reload} />
              )}
            </>
          ) : (
            <Typography color="text.secondary" sx={{ p: 2 }}>{mapKey ? 'Loading' : 'Pick a map'}</Typography>
          )}
        </Paper>

        {nodeKey && !phone && (
          <Paper variant="outlined" component="aside" aria-label="Node" sx={{ width: { md: 380 }, flexShrink: 0, p: 2, overflow: 'auto' }}>
            {panelFor(nodeKey)}
          </Paper>
        )}
      </Box>

      {phone && (
        <Drawer anchor="bottom" variant="temporary" open={nodeKey !== null} onClose={closeNode} slotProps={{ paper: { 'aria-label': 'Node', sx: { maxHeight: '85%', ...safeArea(['bottom', 'left', 'right'], 16) } } }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
            <IconButton aria-label="Close node" onClick={closeNode}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {drawerKey ? panelFor(drawerKey) : null}
        </Drawer>
      )}

      {dialog === 'new-map' && <MapDialog project={project ?? undefined} onClose={closeDialog} onSaved={(m) => { closeDialog(); reload(); navigate(mapPath(m.key)) }} />}
      {dialog === 'edit-map' && map && <MapDialog map={map} onClose={closeDialog} onSaved={saved} />}
      {dialog === 'archive-map' && map && <ArchiveDialog target={{ kind: 'map', item: map }} onClose={closeDialog} onSaved={saved} />}
      {dialog === 'delete-map' && map && <DeleteDialog target={{ kind: 'map', key: map.key, label: map.title }} onClose={closeDialog} onDeleted={() => { closeDialog(); navigate(mapPath()); reload() }} />}
      {dialog === 'link-map' && map && <LinkDialog target={{ kind: 'map', key: map.key }} onClose={closeDialog} onSaved={saved} />}
      {dialog === 'direction-map' && map && <DirectionDialog mapKey={map.key} onClose={closeDialog} onSaved={saved} />}
      {dialog === 'new-node' && map && <NodeDialog mapKey={map.key} parent={selectedNode ?? map.root} onClose={closeDialog} onSaved={(n) => { closeDialog(); reload(); openNode(n.key) }} />}
    </Box>
  )
}
