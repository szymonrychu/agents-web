/** The interactive map graph: dagre-laid-out React Flow nodes as MUI cards, drag to re-parent, handles to connect. */
import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Background, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { createEdge, EDGE_KINDS, getNode, patchNode } from './api'
import type { EdgeKind, NodeStub, Subgraph } from './api'
import { dropTarget, NODE_H, NODE_W, toFlow } from './graphLayout'
import type { Direction, MindEdge, MindNode, MindNodeData } from './graphLayout'

function MindNodeCard({ data, selected }: NodeProps<MindNode>) {
  const n = data.node
  return (
    <Box
      data-testid={`mind-node-${n.key}`}
      sx={{
        width: NODE_W, height: NODE_H, boxSizing: 'border-box', px: 1, py: 0.5, borderRadius: 1, bgcolor: 'background.paper', overflow: 'hidden',
        border: 1, borderColor: selected ? 'primary.main' : n.stub ? 'text.disabled' : 'divider', borderStyle: n.stub ? 'dashed' : 'solid',
        opacity: n.stub ? 0.8 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Typography noWrap title={n.topic} sx={{ fontSize: TOKENS.fontSizes.sm, fontWeight: 500 }}>{n.topic}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
        <Chip size="small" label={n.status} />
        {n.open_growth_areas > 0 && <Chip size="small" variant="outlined" label={`${n.open_growth_areas} open`} />}
        {n.embedding_pending && <Box title="Embedding pending" aria-label="Embedding pending" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }} />}
        {n.stub && <Typography variant="caption" color="text.secondary" noWrap>{n.project}</Typography>}
      </Box>
      <Handle type="source" position={Position.Bottom} />
    </Box>
  )
}

const nodeTypes = { mind: MindNodeCard }

type Pending = { kind: 'reparent'; child: NodeStub; parent: NodeStub } | { kind: 'connect'; src: string; dst: string }

export interface GraphViewProps {
  graph: Subgraph
  dir: Direction
  selected: string | null
  onSelect: (node: NodeStub) => void
  /** Called after a graph change so the page refetches. */
  onChanged: () => void
}

export function GraphView({ graph, dir, selected, onSelect, onChanged }: GraphViewProps) {
  const layout = useMemo(() => toFlow(graph, dir), [graph, dir])
  const [nodes, setNodes, onNodesChange] = useNodesState<MindNode>(layout.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<MindEdge>(layout.edges)
  const [pending, setPending] = useState<Pending>()
  const [kind, setKind] = useState<EdgeKind>('relates_to')
  const [note, setNote] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)
  }, [layout, setNodes, setEdges])

  const byKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph])
  const resetLayout = () => setNodes(layout.nodes)
  const close = () => {
    setPending(undefined)
    setError(undefined)
    setKind('relates_to')
    setNote('')
    resetLayout()
  }

  const onNodeDragStop = (_: unknown, dragged: MindNode, all: MindNode[]) => {
    const child = byKey.get(dragged.id)
    const targetKey = dropTarget(dragged, all)
    const parent = targetKey === null ? undefined : byKey.get(targetKey)
    // The root cannot move and a stub belongs to another project: both snap back, as does a drop on the current parent.
    if (!child || !parent || child.stub || parent.stub || child.parent === null || child.parent === parent.key) return resetLayout()
    setPending({ kind: 'reparent', child, parent })
  }
  const onConnect = ({ source, target }: { source: string; target: string }) => {
    if (source !== target) setPending({ kind: 'connect', src: source, dst: target })
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    setError(undefined)
    try {
      if (pending.kind === 'reparent') {
        const current = await getNode(pending.child.key)
        await patchNode(pending.child.key, { version: current.version, parent: pending.parent.key })
      } else {
        await createEdge({ src: pending.src, dst: pending.dst, kind, note })
      }
      setPending(undefined)
      setKind('relates_to')
      setNote('')
      onChanged()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === selected }))}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_, n) => onSelect((n.data as MindNodeData).node)}
        fitView
        nodesConnectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
      {graph.truncated && <Chip size="small" color="warning" label="Graph truncated" sx={{ position: 'absolute', top: 8, left: 8 }} />}
      {pending && (
        <Dialog open onClose={close} fullWidth maxWidth="xs">
          <DialogTitle>{pending.kind === 'reparent' ? 'Move node' : 'New edge'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            {pending.kind === 'reparent' ? (
              <Typography>Move <b>{pending.child.topic}</b> ({pending.child.key}) under <b>{pending.parent.topic}</b> ({pending.parent.key})? Its subtree moves with it.</Typography>
            ) : (
              <>
                <Typography>Connect {pending.src} to {pending.dst}.</Typography>
                <TextField select label="Edge kind" value={kind} onChange={(e) => setKind(e.target.value as EdgeKind)}>
                  {EDGE_KINDS.map((k) => <MenuItem key={k} value={k}>{k.replace(/_/g, ' ')}</MenuItem>)}
                </TextField>
                <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
              </>
            )}
            <FormError error={error instanceof Error ? error : undefined} />
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" disabled={busy} onClick={() => void confirm()}>{pending.kind === 'reparent' ? 'Move' : 'Create edge'}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}
