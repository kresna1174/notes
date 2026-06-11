import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { ulid } from 'ulid'

const NODE_TYPES_AVAILABLE = ['rectangle', 'circle', 'diamond'] as const

function DiagramNodeView({ node, updateAttributes }: any) {
  const [open, setOpen] = useState(false)
  const parsed = (() => {
    try { return JSON.parse(node.attrs.data) } catch { return { nodes: [], edges: [] } }
  })()

  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges)

  useEffect(() => {
    if (open) {
      try {
        const fresh = JSON.parse(node.attrs.data)
        setNodes(fresh.nodes || [])
        setEdges(fresh.edges || [])
      } catch {
        setNodes([])
        setEdges([])
      }
    }
  }, [open])

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  )

  function handleCancel() {
    try {
      const fresh = JSON.parse(node.attrs.data)
      setNodes(fresh.nodes || [])
      setEdges(fresh.edges || [])
    } catch {
      setNodes([])
      setEdges([])
    }
    setOpen(false)
  }

  function save() {
    updateAttributes({ data: JSON.stringify({ nodes, edges }) })
    setOpen(false)
  }

  function addNode(type: string) {
    const id = ulid()
    setNodes(ns => [...ns, {
      id,
      type: 'default',
      position: { x: 100 + ns.length * 60, y: 100 },
      data: { label: type },
      style: type === 'circle'
        ? { borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : type === 'diamond'
        ? { transform: 'rotate(45deg)', width: 80, height: 80 }
        : {},
    }])
  }

  return (
    <NodeViewWrapper>
      <div
        className="border rounded-lg bg-muted/30 flex items-center justify-center cursor-pointer h-40 text-sm text-muted-foreground hover:bg-muted/50 select-none"
        onClick={() => setOpen(true)}
      >
        {nodes.length === 0
          ? 'Click to add diagram'
          : `Diagram · ${nodes.length} node${nodes.length !== 1 ? 's' : ''}, ${edges.length} edge${edges.length !== 1 ? 's' : ''}`}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Edit Diagram</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 px-4 pb-2 border-b">
            {NODE_TYPES_AVAILABLE.map(t => (
              <Button key={t} variant="outline" size="sm" onClick={() => addNode(t)}>
                + {t}
              </Button>
            ))}
          </div>
          <div className="flex-1 h-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
            >
              <Controls />
              <MiniMap />
              <Background />
            </ReactFlow>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t">
            <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  )
}

export const DiagramBlock = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  addAttributes() {
    return { data: { default: JSON.stringify({ nodes: [], edges: [] }) } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="diagram"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView)
  },
})
