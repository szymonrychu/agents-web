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
import { getGraph, getMap, listMaps, listProjects, mindmapEnabled } from './api'
import type { MapView, NodeStub, ProjectCount, Subgraph } from './api'
import { DirectionDialog } from './DirectionDialog'
import { DirectionsTab } from './DirectionsTab'
import { ArchiveDialog, DeleteDialog, LinkDialog, MapDialog, NodeDialog } from './EditDialogs'
import { GraphView } from './GraphView'
import type { Direction } from './graphLayout'
import { NodePanel } from './NodePanel'
import { mapPath } from './paths'
import { SearchBox } from './SearchBox'
import { useMindmapStream } from './useMindmapStream'

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
  const [map, setMap] = useState<MapView>()
  const [graph, setGraph] = useState<Subgraph>()
  const [dir, setDir] = useState<Direction>('TB')
  const [error, setError] = useState<unknown>()
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState<Dialog>()
  const [pickedTab, setPickedTab] = useState<'graph' | 'directions'>('graph')
  const reload = useCallback(() => setRefresh((n) => n + 1), [])
  const enabled = mindmapEnabled()

  useMindmapStream(enabled ? project : null, reload)

  useEffect(() => {
    if (!enabled) return
    listProjects().then(setProjects, setError)
  }, [enabled, refresh])
  useEffect(() => {
    if (!enabled) return
    listMaps({ project }).then((m) => { setMaps(m); setError(undefined) }, setError)
  }, [enabled, project, refresh])
  useEffect(() => {
    if (!enabled || !mapKey) return
    Promise.all([getMap(mapKey), getGraph(mapKey)]).then(([m, g]) => { setMap(m); setGraph(g); setError(undefined) }, setError)
  }, [enabled, mapKey, refresh])

  const select = (n: NodeStub) => navigate(mapPath(n.map, { node: n.key }))
  const openNode = (key: string) => navigate(mapPath(mapKey, { node: key, direction: directionKey ?? undefined }))
  /** `?direction=` always shows the directions tab; picking Graph drops it from the URL. */
  const tab = directionKey ? 'directions' : pickedTab
  const pickTab = (t: 'graph' | 'directions') => {
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
                <ListItemText primary={m.title} secondary={`${m.key} - ${m.project}`} />
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
              <Tabs value={tab} onChange={(_, v: 'graph' | 'directions') => pickTab(v)} aria-label="Map views" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="graph" label="Graph" />
                <Tab value="directions" label="Directions" />
              </Tabs>
              {tab === 'graph' ? (
                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                  <GraphView graph={graph} dir={dir} selected={selectedNode} onSelect={select} onChanged={reload} />
                </Box>
              ) : (
                <DirectionsTab mapKey={map.key} refreshKey={refresh} selected={directionKey} onOpenNode={openNode} onChanged={reload} />
              )}
            </>
          ) : (
            <Typography color="text.secondary" sx={{ p: 2 }}>{mapKey ? 'Loading' : 'Pick a map'}</Typography>
          )}
        </Paper>

        {selectedNode && (
          <Paper variant="outlined" component="aside" aria-label="Node" sx={{ width: { md: 380 }, flexShrink: 0, p: 2, overflow: 'auto' }}>
            <NodePanel
              key={selectedNode}
              nodeKey={selectedNode}
              refreshKey={refresh}
              onChanged={reload}
              onDeleted={() => { navigate(mapPath(mapKey)); reload() }}
              onOpenNode={openNode}
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
