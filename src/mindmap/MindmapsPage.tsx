/** The Mindmaps page: project selector and map list (left), the graph (centre) and the node panel (right). */
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router'
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

export function MindmapsPage() {
  const { mapKey } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const nodeKey = params.get('node')
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
  const selectedNode = nodeKey !== null && graph?.nodes.some((n) => n.key === nodeKey) ? nodeKey : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button component={RouterLink} to="/">Back</Button>
        <Typography variant="h6" component="h1">Mindmaps</Typography>
      </Stack>
      <FormError error={error instanceof Error ? error : undefined} />
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0, gap: 1, flexDirection: { xs: 'column', md: 'row' } }}>
        <Paper variant="outlined" component="nav" aria-label="Maps" sx={{ width: { md: 260 }, flexShrink: 0, p: 1, overflow: 'auto', maxHeight: { xs: 220, md: 'none' } }}>
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
              <ListItemButton key={m.key} selected={m.key === mapKey} component={RouterLink} to={mapPath(m.key)}>
                <ListItemText primary={m.title} secondary={`${m.key} - ${m.project}${m.key === map?.key && graph ? ` - ${nodeCount(graph, m.key)}` : ''}`} />
                {(openDirections.get(m.key) ?? 0) > 0 && <Chip size="small" color="warning" sx={{ mr: 0.5 }} label={`${openDirections.get(m.key)} open ${openDirections.get(m.key) === 1 ? 'direction' : 'directions'}`} />}
                <Chip size="small" label={m.kind} />
                {m.status === 'archived' && <Chip size="small" label="archived" sx={{ ml: 0.5 }} />}
              </ListItemButton>
            ))}
            {maps.length === 0 && <Typography color="text.secondary" sx={{ p: 1 }}>No maps</Typography>}
          </List>
        </Paper>

        <Paper variant="outlined" component="section" aria-label="Graph" sx={{ flexGrow: 1, minWidth: 0, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
          {mapKey && map?.key === mapKey && graph ? (
            <>
              <Stack direction="row" spacing={1} useFlexGap sx={{ p: 1, borderBottom: 1, borderColor: 'divider', alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 500 }}>{map.title}</Typography>
                <Chip size="small" label={map.status} />
                <ToggleButtonGroup size="small" exclusive value={dir} onChange={(_, v: Direction | null) => v && setDir(v)} aria-label="Layout direction">
                  <ToggleButton value="TB">Top-down</ToggleButton>
                  <ToggleButton value="LR">Left-right</ToggleButton>
                </ToggleButtonGroup>
                <Button size="small" onClick={() => setDialog('new-node')}>Add node</Button>
                <Button size="small" onClick={() => setDialog('edit-map')}>Edit map</Button>
                <Button size="small" onClick={() => setDialog('link-map')}>Link</Button>
                <Button size="small" onClick={() => setDialog('direction-map')}>Send direction</Button>
                <Button size="small" onClick={() => setDialog('archive-map')}>Archive</Button>
                <Button size="small" color="error" onClick={() => setDialog('delete-map')}>Delete</Button>
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

        {nodeKey && (
          <Paper variant="outlined" component="aside" aria-label="Node" sx={{ width: { md: 380 }, flexShrink: 0, p: 2, overflow: 'auto' }}>
            <NodePanel
              key={nodeKey}
              nodeKey={nodeKey}
              mapKey={mapKey}
              onOpenMap={(m, k) => navigate(mapPath(m, { node: k }))}
              refreshKey={refresh}
              onChanged={reload}
              onDeleted={() => { navigate(mapPath(mapKey)); reload() }}
              onOpenNode={openNode}
              descendants={graph?.nodes.some((n) => n.key === nodeKey) ? countDescendants(graph.nodes, nodeKey) : undefined}
            />
          </Paper>
        )}
      </Box>

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
