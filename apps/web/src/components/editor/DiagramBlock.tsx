import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  Handle,
  Position,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Trash2 } from 'lucide-react'

const NODE_TYPES_AVAILABLE = ['rectangle', 'circle', 'diamond'] as const

// Custom Node Components to support theme styles, avoid rotated text, and allow easy handle connections
function RectangleNode({ data, selected }: any) {
  return (
    <div
      style={{
        padding: '10px 20px',
        borderRadius: 6,
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: 'var(--bg-app)',
        color: 'var(--fg)',
        minWidth: 100,
        textAlign: 'center',
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        fontWeight: 500,
        boxShadow: selected ? '0 0 0 1px var(--primary), 0 2px 12px var(--accent)' : '0 2px 8px rgba(0,0,0,0.1)',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
    </div>
  )
}

function CircleNode({ data, selected }: any) {
  return (
    <div
      style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        background: 'var(--bg-app)',
        color: 'var(--fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        fontWeight: 500,
        boxShadow: selected ? '0 0 0 1px var(--primary), 0 2px 12px var(--accent)' : '0 2px 8px rgba(0,0,0,0.1)',
        position: 'relative',
        padding: 8,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <div style={{ wordBreak: 'break-word', overflow: 'hidden', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', width: 8, height: 8 }} />
    </div>
  )
}

function DiamondNode({ data, selected }: any) {
  return (
    <div
      style={{
        width: 80,
        height: 80,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background shape (rotated by 45deg) */}
      <div
        style={{
          position: 'absolute',
          inset: 4,
          transform: 'rotate(45deg)',
          borderRadius: 4,
          border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
          background: 'var(--bg-app)',
          boxShadow: selected ? '0 0 0 1px var(--primary), 0 2px 12px var(--accent)' : '0 2px 8px rgba(0,0,0,0.1)',
        }}
      />
      {/* Foreground content (not rotated so text remains horizontal) */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'var(--fg)',
          textAlign: 'center',
          maxWidth: '70%',
          wordBreak: 'break-word',
        }}
      >
        {data.label}
      </div>
      {/* Handles are placed outer borders so lines connect perfectly */}
      <Handle type="target" position={Position.Top} style={{ background: 'var(--primary)', width: 8, height: 8, top: 0 }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--primary)', width: 8, height: 8, left: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--primary)', width: 8, height: 8, bottom: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', width: 8, height: 8, right: 0 }} />
    </div>
  )
}

const nodeTypes = {
  default: RectangleNode, // Fallback mapping so older diagram nodes don't crash the editor
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
}

function DiagramNodeView({ node, updateAttributes, deleteNode }: any) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  const parsed = (() => {
    try { return JSON.parse(node.attrs.data) } catch { return { nodes: [], edges: [] } }
  })()

  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges)

  // Sync state whenever node attributes change
  useEffect(() => {
    try {
      const fresh = JSON.parse(node.attrs.data)
      setNodes(fresh.nodes || [])
      setEdges(fresh.edges || [])
    } catch {
      setNodes([])
      setEdges([])
    }
  }, [node.attrs.data, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, flowNode: any) => {
      const newLabel = prompt('Ganti label node:', flowNode.data.label)
      if (newLabel !== null) {
        setNodes(ns =>
          ns.map(n => (n.id === flowNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n))
        )
      }
    },
    [setNodes]
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
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15)
    setNodes(ns => [...ns, {
      id,
      type, // Use custom node type: 'rectangle', 'circle', or 'diamond'
      position: { x: 100 + ns.length * 60, y: 100 },
      data: { label: type.toUpperCase() },
      style: {},
    }])
  }

  return (
    <NodeViewWrapper>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hovered && (
          <button
            onMouseDown={e => { e.stopPropagation(); deleteNode() }}
            title="Delete diagram"
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 10,
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
              color: '#e03131', display: 'flex', alignItems: 'center',
            }}
          >
            <Trash2 size={14} />
          </button>
        )}

        <div
          onMouseDown={e => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }}
          style={{
            border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--muted)', height: 250,
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => {
            const overlay = e.currentTarget.querySelector('.edit-overlay') as HTMLDivElement
            if (overlay) overlay.style.opacity = '1'
          }}
          onMouseLeave={e => {
            const overlay = e.currentTarget.querySelector('.edit-overlay') as HTMLDivElement
            if (overlay) overlay.style.opacity = '0'
          }}
        >
          {nodes.length === 0 ? (
            <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontFamily: 'var(--font-body)', color: 'var(--fg-muted)' }}>
              + Klik untuk membuat diagram
            </div>
          ) : (
            <>
              <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={false}
                  zoomOnScroll={false}
                  zoomOnPinch={false}
                  zoomOnDoubleClick={false}
                  preventScrolling={true}
                >
                  <Background />
                </ReactFlow>
              </div>
              <div
                className="edit-overlay"
                style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0, 0, 0, 0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.2s',
                  color: '#fff', fontSize: '0.9rem', fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                }}
              >
                Klik untuk Edit Diagram
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
        <DialogContent
          aria-describedby={undefined}
          style={{
            maxWidth: '96vw', width: '96vw', height: '92vh',
            display: 'flex', flexDirection: 'column',
            padding: 0, gap: 0, overflow: 'hidden',
            background: 'var(--card-bg)', color: 'var(--fg)',
            borderRadius: 16, border: '1px solid var(--border)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }}
        >
          <DialogHeader style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: '0.9375rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
              Edit Diagram (Double Click node untuk mengubah label)
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {NODE_TYPES_AVAILABLE.map(t => (
              <button
                key={t}
                onClick={() => addNode(t)}
                style={{
                  padding: '4px 12px', fontSize: '0.8125rem',
                  fontFamily: 'var(--font-body)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg)', cursor: 'pointer', color: 'var(--fg)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
              >
                + {t}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDoubleClick={onNodeDoubleClick}
                fitView
              >
                <Controls />
                <MiniMap />
                <Background />
              </ReactFlow>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '6px 16px', fontSize: '0.875rem',
                fontFamily: 'var(--font-body)',
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--bg)', cursor: 'pointer', color: 'var(--fg-muted)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              style={{
                padding: '6px 16px', fontSize: '0.875rem',
                fontFamily: 'var(--font-body)',
                border: 'none', borderRadius: 6,
                background: 'var(--primary)', cursor: 'pointer',
                color: 'var(--primary-fg)', fontWeight: 500,
              }}
            >
              Save
            </button>
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
  parseHTML() { return [{ tag: 'div[data-type="diagram"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram' })]
  },
  addNodeView() { return ReactNodeViewRenderer(DiagramNodeView) },
})
