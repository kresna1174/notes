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
  ReactFlowProvider,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Trash2, Sparkles } from 'lucide-react'

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
  default: RectangleNode,
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
}

/** Compute bounding box of all nodes from their position + estimated size */
function computeBBox(nodes: any[]) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return { spreadH: 0, spreadW: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (!n) continue
    const pos = n.position || { x: 0, y: 0 }
    const x = pos.x ?? 0
    const y = pos.y ?? 0
    const w = (n.width ?? n.style?.width ?? 120) as number
    const h = (n.height ?? n.style?.height ?? 60) as number
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  return { spreadH: maxY - minY, spreadW: maxX - minX }
}

function DiagramNodeView({ node, updateAttributes, deleteNode, editor }: any) {
  const [hovered, setHovered] = useState(false)

  const parsed = (() => {
    try { return JSON.parse(node.attrs.data) } catch { return { nodes: [], edges: [] } }
  })()

  const [nodes, setNodes] = useNodesState(parsed.nodes)
  const [edges, setEdges] = useEdgesState(parsed.edges)

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

  const safeNodes = Array.isArray(nodes) ? nodes : []
  const { spreadH } = computeBBox(safeNodes)
  const previewH = safeNodes.length === 0 ? 200 : Math.max(200, Math.min(420, spreadH + 100))

  const handleOpenEditor = () => {
    if (editor.storage.diagram?.openEditor) {
      let nodeId = node.attrs.id
      if (!nodeId) {
        nodeId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15)
        updateAttributes({ id: nodeId })
      }
      editor.storage.diagram.openEditor(nodeId, node.attrs.data)
    }
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
            handleOpenEditor()
          }}
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            handleOpenEditor()
          }}
          style={{
            border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--muted)', height: previewH,
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
                  fitViewOptions={{ padding: 0.15 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={false}
                  zoomOnScroll={false}
                  zoomOnPinch={false}
                  zoomOnDoubleClick={false}
                  preventScrolling={true}
                  proOptions={{ hideAttribution: true }}
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
                  pointerEvents: 'none',
                }}
              >
                Klik untuk Edit Diagram
              </div>
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export function EditDiagramDialog({
  editor,
  data,
  onClose,
}: {
  editor: any
  data: { id: string; initialData: string }
  onClose: () => void
}) {
  const [open, setOpen] = useState(true)
  const parsed = (() => {
    try { return JSON.parse(data.initialData) } catch { return { nodes: [], edges: [] } }
  })()

  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges)

  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAiInput, setShowAiInput] = useState(false)

  async function generateWithAi() {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      const data = await res.json()
      if (data.nodes) {
        setNodes(data.nodes)
      }
      if (data.edges) {
        setEdges(data.edges)
      }
      setShowAiInput(false)
      setAiPrompt('')
    } catch (err) {
      console.error('Failed to generate diagram:', err)
      alert('Gagal membuat diagram: ' + String(err))
    } finally {
      setAiLoading(false)
    }
  }

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
    onClose()
  }

  function save() {
    editor.commands.command(({ tr, dispatch }) => {
      let foundPos = -1
      tr.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'diagram' && node.attrs.id === data.id) {
          foundPos = pos
          return false // Stop traversing
        }
      })

      if (foundPos !== -1 && dispatch) {
        tr.setNodeMarkup(foundPos, null, {
          ...tr.doc.nodeAt(foundPos)?.attrs,
          data: JSON.stringify({ nodes, edges })
        })
        return true
      }
      return false
    })
    onClose()
  }

  function addNode(type: string) {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15)
    setNodes(ns => [...ns, {
      id,
      type,
      position: { x: 100 + ns.length * 60, y: 100 },
      data: { label: type.toUpperCase() },
      style: {},
    }])
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
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

        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'center' }}>
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

          <button
            onClick={() => setShowAiInput(true)}
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-body)',
              border: '1px solid #a855f7',
              borderRadius: 6,
              background: 'rgba(168, 85, 247, 0.1)',
              cursor: 'pointer',
              color: '#c084fc',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'
            }}
          >
            <Sparkles size={13} />
            <span>Generate dengan AI ✨</span>
          </button>
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

        {showAiInput && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2)',
              width: '450px',
              maxWidth: '90%',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontFamily: 'var(--font-body)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', fontWeight: 600, color: '#a855f7' }}>
                <Sparkles size={16} />
                <span>Buat Diagram dengan AI</span>
              </div>
              
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', margin: 0 }}>
                Jelaskan diagram yang ingin Anda buat. AI akan secara otomatis merancang node, alur hubungan, koordinat, dan tata letak diagram untuk Anda.
              </p>

              {aiLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 0' }}>
                  <div className="dot-blink" style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', animationDelay: '0.2s' }} />
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', animationDelay: '0.4s' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)' }}>AI sedang merancang diagram...</span>
                </div>
              ) : (
                <>
                  <textarea
                    autoFocus
                    placeholder="Contoh: Alur registrasi user baru dengan verifikasi OTP email, jika sukses masuk dashboard, jika gagal kembali ke form..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    style={{
                      width: '100%',
                      height: '100px',
                      padding: '10px',
                      fontSize: '0.85rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      outline: 'none',
                      resize: 'none',
                      fontFamily: 'var(--font-body)',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        generateWithAi()
                      }
                      if (e.key === 'Escape') {
                        setShowAiInput(false)
                      }
                    }}
                  />
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => setShowAiInput(false)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.8125rem',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--fg-muted)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      Batal
                    </button>
                    <button
                      onClick={generateWithAi}
                      disabled={!aiPrompt.trim()}
                      style={{
                        padding: '6px 16px',
                        fontSize: '0.8125rem',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--primary)',
                        color: 'var(--primary-fg)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        opacity: aiPrompt.trim() ? 1 : 0.6,
                      }}
                    >
                      Buat Diagram
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export const DiagramBlock = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: false,
  addStorage() {
    return {
      openEditor: null as ((id: string, initialData: string) => void) | null,
    }
  },
  addAttributes() {
    return {
      id: {
        default: () => typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15),
      },
      data: { default: JSON.stringify({ nodes: [], edges: [] }) }
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="diagram"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView, {
      update: () => true,
    })
  },
})
