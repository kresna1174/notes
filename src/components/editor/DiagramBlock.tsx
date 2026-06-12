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
import { Trash2 } from 'lucide-react'

const NODE_TYPES_AVAILABLE = ['rectangle', 'circle', 'diamond'] as const

function DiagramNodeView({ node, updateAttributes, deleteNode }: any) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

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
    const id = crypto.randomUUID()
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
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); deleteNode() }}
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
          onClick={() => setOpen(true)}
          style={{
            border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--muted)', height: 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '0.875rem',
            fontFamily: 'var(--font-body)', color: 'var(--fg-muted)',
            userSelect: 'none', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--muted)')}
        >
          {nodes.length === 0
            ? '+ Click to create diagram'
            : `Diagram · ${nodes.length} node${nodes.length !== 1 ? 's' : ''}, ${edges.length} edge${edges.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel() }}>
        <DialogContent
          style={{
            maxWidth: '90vw', width: 900, height: '85vh',
            display: 'flex', flexDirection: 'column',
            padding: 0, gap: 0, overflow: 'hidden',
            background: 'var(--card-bg)', color: 'var(--fg)',
          }}
        >
          <DialogHeader style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: '0.9375rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
              Edit Diagram
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
