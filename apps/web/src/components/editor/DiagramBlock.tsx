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
import { Trash2, Sparkles, GripVertical } from 'lucide-react'

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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node?: any } | null>(null)
  const [aiCoords, setAiCoords] = useState<{ x: number; y: number } | null>(null)
  const [aiPromptTarget, setAiPromptTarget] = useState<any | null>(null)

  const [showRenameInput, setShowRenameInput] = useState(false)
  const [renameTargetNode, setRenameTargetNode] = useState<any | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameCoords, setRenameCoords] = useState<{ x: number; y: number } | null>(null)

  const [isDragging, setIsDragging] = useState<'ai' | 'rename' | false>(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'ai' | 'rename') => {
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return

    e.preventDefault()
    setIsDragging(type)
    
    const coords = type === 'ai' ? aiCoords : renameCoords
    const currentX = coords ? coords.x : (window.innerWidth / 2) - 225
    const currentY = coords ? coords.y : (window.innerHeight / 2) - 150

    setDragStart({
      x: e.clientX - currentX,
      y: e.clientY - currentY,
    })
  }, [aiCoords, renameCoords])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    if (isDragging === 'ai') {
      setAiCoords({ x: newX, y: newY })
    } else if (isDragging === 'rename') {
      setRenameCoords({ x: newX, y: newY })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    } else {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  async function generateWithAi() {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      let finalPrompt = aiPrompt
      if (aiPromptTarget) {
        finalPrompt = `Ubah/kembangkan node ini di diagram.
Node Target: { id: "${aiPromptTarget.id}", label: "${aiPromptTarget.data?.label || ''}" }
Instruksi Pengguna: ${aiPrompt}
Diagram Saat Ini: ${JSON.stringify({ nodes, edges })}`
      } else if (aiCoords) {
        finalPrompt = `${aiPrompt}
Catatan: Posisikan node utama/root di koordinat (x: ${Math.round(aiCoords.x)}, y: ${Math.round(aiCoords.y)}).`
      }

      const res = await fetch('/api/ai/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt })
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
      setAiCoords(null)
      setAiPromptTarget(null)
      setAiPrompt('')
    } catch (err) {
      console.error('Failed to generate diagram:', err)
      alert('Gagal membuat diagram: ' + String(err))
    } finally {
      setAiLoading(false)
    }
  }

  const renameNode = useCallback((node: any) => {
    setRenameTargetNode(node)
    setRenameValue(node.data.label || '')
    setRenameCoords({ x: (window.innerWidth / 2) - 175, y: (window.innerHeight / 2) - 100 })
    setShowRenameInput(true)
    setContextMenu(null)
  }, [])

  const deleteNodeById = useCallback((nodeId: string) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setContextMenu(null)
  }, [setNodes, setEdges])

  const addNodeAtCoords = useCallback((type: string, x: number, y: number) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15)
    setNodes(ns => [...ns, {
      id,
      type,
      position: { x: x - 60, y: y - 30 },
      data: { label: `Node Baru (${type})` },
      style: {},
    }])
    setContextMenu(null)
  }, [setNodes])

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault()
      event.stopPropagation()
      const rectFlowWrapper = event.currentTarget.closest('.react-flow-wrapper')
      const rectFlowBounds = rectFlowWrapper?.getBoundingClientRect()
      if (rectFlowBounds) {
        setContextMenu({
          x: event.clientX - rectFlowBounds.left,
          y: event.clientY - rectFlowBounds.top,
          node,
        })
      }
    },
    []
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const rectFlowBounds = event.currentTarget.getBoundingClientRect()
      setContextMenu({
        x: event.clientX - rectFlowBounds.left,
        y: event.clientY - rectFlowBounds.top,
      })
    },
    []
  )

  const handlePaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  const saveLabel = useCallback(() => {
    if (!renameTargetNode) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setNodes(ns => ns.map(n => (n.id === renameTargetNode.id ? { ...n, data: { ...n.data, label: trimmed } } : n)))
    }
    setShowRenameInput(false)
    setRenameTargetNode(null)
    setRenameValue('')
    setRenameCoords(null)
  }, [renameTargetNode, renameValue, setNodes])

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, flowNode: any) => {
      setRenameTargetNode(flowNode)
      setRenameValue(flowNode.data.label || '')
      setRenameCoords({ x: (window.innerWidth / 2) - 175, y: (window.innerHeight / 2) - 100 })
      setShowRenameInput(true)
    },
    []
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
            onClick={() => {
              const x = (window.innerWidth / 2) - 225
              const y = (window.innerHeight / 2) - 150
              setAiCoords({ x, y })
              setAiPromptTarget(null)
              setShowAiInput(true)
            }}
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

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div className="react-flow-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneContextMenu={handlePaneContextMenu}
              onPaneClick={handlePaneClick}
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

        {contextMenu && (
          <div
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 999,
              background: 'transparent',
            }}
          />
        )}

        {contextMenu && (
          <div
            style={{
              position: 'absolute',
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              zIndex: 1001,
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '4px',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -2px rgba(0,0,0,0.2)',
              minWidth: '160px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
            }}
          >
            {contextMenu.node ? (
              <>
                <div style={{ padding: '4px 8px', color: 'var(--fg-muted)', fontSize: '0.7rem', fontWeight: 600, borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                  Node: {contextMenu.node.data?.label || 'Tanpa Nama'}
                </div>
                <button
                  onClick={() => {
                    setAiPromptTarget(contextMenu.node)
                    setAiCoords({ x: contextMenu.x, y: contextMenu.y })
                    setShowAiInput(true)
                    setContextMenu(null)
                  }}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4, fontWeight: 600
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Sparkles size={12} style={{ color: '#a855f7' }} />
                  <span style={{ color: '#c084fc' }}>Edit dengan AI ✨</span>
                </button>
                <button
                  onClick={() => renameNode(contextMenu.node)}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>✏️ Ubah Label</span>
                </button>
                <button
                  onClick={() => deleteNodeById(contextMenu.node.id)}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: '#e03131', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(224, 49, 49, 0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>🗑️ Hapus Node</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAiPromptTarget(null)
                    setAiCoords({ x: contextMenu.x, y: contextMenu.y })
                    setShowAiInput(true)
                    setContextMenu(null)
                  }}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4, fontWeight: 600
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Sparkles size={12} style={{ color: '#a855f7' }} />
                  <span style={{ color: '#c084fc' }}>Generate dengan AI ✨</span>
                </button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => addNodeAtCoords('rectangle', contextMenu.x, contextMenu.y)}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>+ Tambah Rectangle</span>
                </button>
                <button
                  onClick={() => addNodeAtCoords('circle', contextMenu.x, contextMenu.y)}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>+ Tambah Circle</span>
                </button>
                <button
                  onClick={() => addNodeAtCoords('diamond', contextMenu.x, contextMenu.y)}
                  style={{
                    width: '100%', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6,
                    border: 'none', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 4
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>+ Tambah Diamond</span>
                </button>
              </>
            )}
          </div>
        )}

        {showAiInput && aiCoords && (
          <div style={{
            position: 'absolute',
            top: `${Math.max(10, Math.min(aiCoords.y, window.innerHeight - 300))}px`,
            left: `${Math.max(10, Math.min(aiCoords.x, window.innerWidth - 480))}px`,
            zIndex: 1000,
            pointerEvents: 'auto',
          }}>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.4)',
              width: '450px',
              maxWidth: '90vw',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontFamily: 'var(--font-body)',
            }}>
              <div
                className="drag-handle"
                onMouseDown={e => handleMouseDown(e, 'ai')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: '#a855f7',
                  cursor: isDragging === 'ai' ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: '8px',
                }}
              >
                <GripVertical size={14} style={{ color: 'var(--fg-muted)', opacity: 0.5, cursor: 'inherit' }} />
                <Sparkles size={16} style={{ cursor: 'inherit' }} />
                <span style={{ cursor: 'inherit', flex: 1 }}>Buat Diagram dengan AI</span>
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
        {showRenameInput && renameCoords && (
          <div style={{
            position: 'absolute',
            top: `${Math.max(10, Math.min(renameCoords.y, window.innerHeight - 250))}px`,
            left: `${Math.max(10, Math.min(renameCoords.x, window.innerWidth - 380))}px`,
            zIndex: 1000,
            pointerEvents: 'auto',
          }}>
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.4)',
              width: '350px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontFamily: 'var(--font-body)',
            }}>
              <div
                className="drag-handle"
                onMouseDown={e => handleMouseDown(e, 'rename')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  cursor: isDragging === 'rename' ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: '4px',
                }}
              >
                <GripVertical size={14} style={{ color: 'var(--fg-muted)', opacity: 0.5, cursor: 'inherit' }} />
                <span style={{ cursor: 'inherit', flex: 1 }}>Ubah Label Node</span>
              </div>

              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                placeholder="Masukkan label baru..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  outline: 'none',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveLabel()
                  if (e.key === 'Escape') {
                    setShowRenameInput(false)
                    setRenameCoords(null)
                    setRenameTargetNode(null)
                  }
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => {
                    setShowRenameInput(false)
                    setRenameCoords(null)
                    setRenameTargetNode(null)
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8125rem',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--fg-muted)',
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={saveLabel}
                  disabled={!renameValue.trim()}
                  style={{
                    padding: '6px 16px',
                    fontSize: '0.8125rem',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    opacity: renameValue.trim() ? 1 : 0.6,
                  }}
                >
                  Simpan
                </button>
              </div>
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
