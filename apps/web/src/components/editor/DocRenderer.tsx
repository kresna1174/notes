import React, { useState } from 'react'
import { marked } from 'marked'
import { FileText, ImageIcon, FileCode, Download, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react'
import { AttachmentPreviewModal, isPreviewable } from './AttachmentPreviewModal'
import ReactFlow, { Background, ReactFlowProvider, type Node, type Edge } from 'reactflow'
import { Handle, Position } from 'reactflow'
import 'reactflow/dist/style.css'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

// ── helpers ──────────────────────────────────────────────────

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export function parseDiagramCount(data: string) {
  try {
    const { nodes = [], edges = [] } = JSON.parse(data || '{}')
    return `${nodes.length} nodes, ${edges.length} edges`
  } catch { return '...' }
}

// ── Read-only node types (same visuals as editor, no interaction) ──────────
function RORect({ data }: any) {
  return (
    <div style={{ padding: '8px 16px', borderRadius: 6, border: '1.5px solid var(--border,#e9ecef)', background: 'var(--bg,#fff)', color: 'var(--fg,#1a1a2e)', minWidth: 80, textAlign: 'center', fontFamily: 'var(--font-body,sans-serif)', fontSize: '0.82rem', fontWeight: 500, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', position: 'relative' }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      {data.label}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}
function ROCircle({ data }: any) {
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1.5px solid var(--border,#e9ecef)', background: 'var(--bg,#fff)', color: 'var(--fg,#1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: 'var(--font-body,sans-serif)', fontSize: '0.78rem', fontWeight: 500, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', position: 'relative', padding: 6 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <span style={{ wordBreak: 'break-word' }}>{data.label}</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}
function RODiamond({ data }: any) {
  return (
    <div style={{ width: 80, height: 80, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 4, transform: 'rotate(45deg)', borderRadius: 4, border: '1.5px solid var(--border,#e9ecef)', background: 'var(--bg,#fff)', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }} />
      <div style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--font-body,sans-serif)', fontSize: '0.78rem', fontWeight: 500, color: 'var(--fg,#1a1a2e)', textAlign: 'center', maxWidth: '70%', wordBreak: 'break-word' }}>{data.label}</div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none', top: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none', left: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none', bottom: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none', right: 0 }} />
    </div>
  )
}

const RO_NODE_TYPES = { default: RORect, rectangle: RORect, circle: ROCircle, diamond: RODiamond }

/** Compute bounding box of all nodes to determine canvas height needed */
function computeBBox(nodes: Node[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 240 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    const x = n.position?.x ?? 0
    const y = n.position?.y ?? 0
    const w = (n.width ?? n.style?.width ?? 120) as number
    const h = (n.height ?? n.style?.height ?? 60) as number
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  return { minX, minY, maxX, maxY }
}

function DiagramPreview({ data }: { data: string }) {
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const parsed = (() => { try { return JSON.parse(data || '{}') } catch { return { nodes: [], edges: [] } } })()
  const nodes: Node[] = parsed.nodes || []
  const edges: Edge[] = parsed.edges || []

  if (nodes.length === 0) {
    return (
      <div style={{ border: '1px dashed var(--border,#e9ecef)', borderRadius: 8, padding: '20px', margin: '8px 0', textAlign: 'center', fontSize: '0.82rem', color: 'var(--fg-muted,#6c757d)', fontFamily: 'var(--font-body,sans-serif)' }}>
        📊 Diagram kosong
      </div>
    )
  }

  // Compute diagram spread to size the container appropriately
  const bbox = computeBBox(nodes)
  const spreadH = bbox.maxY - bbox.minY
  const spreadW = bbox.maxX - bbox.minX
  // Height: proportional to vertical spread, clamped 260–480px
  const height = Math.max(260, Math.min(480, spreadH + 120))
  // Aspect: if diagram is very wide, show helper text
  const isWide = spreadW > 700

  return (
    <div style={{
      border: '1px solid var(--border,#e9ecef)',
      borderRadius: 12,
      margin: '12px 0',
      background: 'var(--card-bg,#fff)',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--primary,#3b5bdb)'
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--border,#e9ecef)'
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
    }}
    >
      {/* Accordion Trigger Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'var(--bg,#fff)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-body,sans-serif)',
          textAlign: 'left',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Custom inline flowchart icon */}
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--accent,#e8edff)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary,#3b5bdb)',
            flexShrink: 0
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <path d="M10 6.5h4c1 0 2 1 2 2v5.5" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg,#1a1a2e)' }}>
              Diagram Alir
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--fg-muted,#6c757d)' }}>
              {nodes.length} node · {edges.length} hubungan
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary,#3b5bdb)' }}>
          <span>{expanded ? 'Sembunyikan' : 'Tampilkan'}</span>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {/* Accordion Content */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border,#e9ecef)',
          position: 'relative',
          height,
          background: 'var(--muted,#f8f9fa)',
          cursor: 'grab',
        }}>
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <div style={{
              fontSize: '0.68rem', color: 'var(--fg-muted,#6c757d)',
              background: 'var(--bg,#fff)', border: '1px solid var(--border,#e9ecef)',
              borderRadius: 6, padding: '2px 8px', pointerEvents: 'none',
              fontFamily: 'var(--font-body,sans-serif)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
            }}>
              Drag untuk geser {isWide && '· Cubit untuk zoom'}
            </div>
            
            <button
              onClick={() => setFullscreen(true)}
              title="Perbesar Layar Penuh"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24,
                border: '1px solid var(--border,#e9ecef)', borderRadius: 6,
                background: 'var(--bg,#fff)', color: 'var(--fg-muted,#6c757d)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary,#3b5bdb)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border,#e9ecef)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
            >
              <Maximize2 size={12} />
            </button>
          </div>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={RO_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={true}
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} size={1} color="var(--border,#e9ecef)" />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      )}

      {fullscreen && (
        <Dialog open={true} onOpenChange={(v) => { if (!v) setFullscreen(false) }}>
          <DialogContent
            aria-describedby={undefined}
            style={{
              maxWidth: '96vw', width: '96vw', height: '92vh',
              display: 'flex', flexDirection: 'column',
              padding: 0, gap: 0, overflow: 'hidden',
              background: 'var(--card-bg,#fff)', color: 'var(--fg,#1a1a2e)',
              borderRadius: 16, border: '1px solid var(--border,#e9ecef)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            }}
          >
            <DialogHeader style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border,#e9ecef)', flexShrink: 0 }}>
              <DialogTitle style={{ fontSize: '0.9375rem', color: 'var(--fg,#1a1a2e)', fontFamily: 'var(--font-heading,sans-serif)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary,#3b5bdb)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <path d="M10 6.5h4c1 0 2 1 2 2v5.5" />
                </svg>
                <span>Pratinjau Diagram</span>
              </DialogTitle>
            </DialogHeader>

            <div style={{ flex: 1, minHeight: 0, background: 'var(--muted,#f8f9fa)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, fontSize: '0.68rem', color: 'var(--fg-muted,#6c757d)', background: 'var(--bg,#fff)', border: '1px solid var(--border,#e9ecef)', borderRadius: 6, padding: '2px 8px', pointerEvents: 'none', fontFamily: 'var(--font-body,sans-serif)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                Drag untuk geser · Scroll/Cubit untuk zoom
              </div>
              <ReactFlowProvider>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={RO_NODE_TYPES}
                  fitView
                  fitViewOptions={{ padding: 0.18 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={true}
                  panOnScroll={false}
                  zoomOnScroll={true}
                  zoomOnPinch={true}
                  zoomOnDoubleClick={true}
                  preventScrolling={false}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={16} size={1} color="var(--border,#e9ecef)" />
                </ReactFlow>
              </ReactFlowProvider>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border,#e9ecef)', flexShrink: 0, background: 'var(--card-bg,#fff)' }}>
              <button
                onClick={() => setFullscreen(false)}
                style={{
                  padding: '6px 16px', fontSize: '0.875rem',
                  fontFamily: 'var(--font-body,sans-serif)',
                  border: '1px solid var(--border,#e9ecef)', borderRadius: 6,
                  background: 'var(--bg,#fff)', cursor: 'pointer', color: 'var(--fg-muted,#6c757d)',
                }}
              >
                Tutup
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isImageType(mime: string) { return mime.startsWith('image/') }

function isViewableTextType(mime: string, filename: string) {
  if (mime.startsWith('text/')) return true
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['md', 'markdown', 'txt', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'log'].includes(ext)
}

// ── Tiptap JSON → HTML (direct, preserves empty paragraphs) ──

function inlineToHtml(nodes: any[]): string {
  return (nodes || []).map(n => {
    if (n.type !== 'text') return nodeToHtml(n)
    let t = esc(n.text || '')
    const marks: string[] = (n.marks || []).map((m: any) => m.type)
    if (marks.includes('code')) t = `<code>${t}</code>`
    if (marks.includes('bold')) t = `<strong>${t}</strong>`
    if (marks.includes('italic')) t = `<em>${t}</em>`
    if (marks.includes('strike')) t = `<s>${t}</s>`
    if (marks.includes('underline')) t = `<u>${t}</u>`
    if (marks.includes('highlight')) t = `<mark>${t}</mark>`
    const link = (n.marks || []).find((m: any) => m.type === 'link')
    if (link) t = `<a href="${esc(link.attrs?.href || '')}" target="_blank" rel="noopener noreferrer">${t}</a>`
    return t
  }).join('')
}

function nodeToHtml(node: any): string {
  if (!node) return ''
  const children = (nodes: any[]) => (nodes || []).map(nodeToHtml).join('')
  switch (node.type) {
    case 'doc': return children(node.content || [])
    case 'paragraph': return `<p>${inlineToHtml(node.content || []) || '<br>'}</p>\n`
    case 'hardBreak': return '<br>'
    case 'heading': {
      const lvl = node.attrs?.level || 1
      return `<h${lvl}>${inlineToHtml(node.content || [])}</h${lvl}>\n`
    }
    case 'bulletList': return `<ul>\n${children(node.content || [])}</ul>\n`
    case 'orderedList': return `<ol start="${node.attrs?.start ?? 1}">\n${children(node.content || [])}</ol>\n`
    case 'listItem': return `<li>${children(node.content || [])}</li>\n`
    case 'blockquote': return `<blockquote>\n${children(node.content || [])}</blockquote>\n`
    case 'codeBlock': {
      const lang = node.attrs?.language ? ` class="language-${esc(node.attrs.language)}"` : ''
      const code = (node.content || []).map((n: any) => esc(n.text || '')).join('')
      return `<pre><code${lang}>${code}</code></pre>\n`
    }
    case 'horizontalRule': return '<hr>\n'
    case 'image': return `<img src="${esc(node.attrs?.src || '')}" alt="${esc(node.attrs?.alt || '')}" style="max-width:100%">\n`
    case 'table': return tableToHtml(node)
    case 'text': return inlineToHtml([node])
    default: return children(node.content || [])
  }
}

function tableToHtml(node: any): string {
  const rows: any[] = (node.content || []).flatMap((r: any) => r.content || [])
  if (!rows.length) return ''
  const renderRow = (row: any, isHeader: boolean) => {
    const tag = isHeader ? 'th' : 'td'
    const cells = (row.content || []).map((c: any) =>
      `<${tag}>${(c.content || []).map(nodeToHtml).join('').trim()}</${tag}>`
    ).join('')
    return `<tr>${cells}</tr>\n`
  }
  const thead = `<thead>\n${renderRow(rows[0], true)}</thead>\n`
  const tbody = rows.length > 1 ? `<tbody>\n${rows.slice(1).map(r => renderRow(r, false)).join('')}</tbody>\n` : ''
  return `<table>\n${thead}${tbody}</table>\n`
}

// ── segments ─────────────────────────────────────────────────

export type Segment =
  | { kind: 'html'; html: string }
  | { kind: 'attachment'; attachmentId: string; filename: string; mimeType: string; size: number }
  | { kind: 'diagram'; data: string }

export function docToSegments(doc: any, titleHtml: string): Segment[] {
  const segments: Segment[] = []
  let htmlBuf = titleHtml

  for (const node of (doc.content || [])) {
    if (node.type === 'attachment') {
      if (htmlBuf) { segments.push({ kind: 'html', html: htmlBuf }); htmlBuf = '' }
      if (node.attrs?.attachmentId) segments.push({ kind: 'attachment', ...node.attrs })
    } else if (node.type === 'diagram') {
      if (htmlBuf) { segments.push({ kind: 'html', html: htmlBuf }); htmlBuf = '' }
      segments.push({ kind: 'diagram', data: node.attrs?.data ?? '' })
    } else {
      htmlBuf += nodeToHtml(node)
    }
  }
  if (htmlBuf) segments.push({ kind: 'html', html: htmlBuf })
  return segments
}

// ── TextDocPreview ────────────────────────────────────────────

function TextDocPreview({ url, filename }: { url: string; filename: string }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isMarkdown = ['md', 'markdown'].includes(ext)

  React.useEffect(() => {
    setLoading(true)
    fetch(url)
      .then(r => r.text())
      .then(t => { setText(t); setLoading(false) })
      .catch(() => setLoading(false))
  }, [url])

  if (loading) return (
    <div style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--fg-muted, #6c757d)', fontFamily: 'var(--font-body, sans-serif)' }}>Memuat…</div>
  )
  if (text === null) return null

  if (isMarkdown) {
    return (
      <div
        className="preview-content"
        style={{ padding: '16px 20px' }}
        dangerouslySetInnerHTML={{ __html: marked.parse(text, { breaks: true, gfm: true }) as string }}
      />
    )
  }
  return (
    <pre style={{
      margin: 0, padding: '16px 20px',
      fontSize: '0.8rem', lineHeight: 1.6,
      color: 'var(--fg, #1a1a2e)', fontFamily: 'monospace',
      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      maxHeight: 400, overflowY: 'auto',
    }}>{text}</pre>
  )
}

// ── AttachmentPreview ─────────────────────────────────────────

export function AttachmentPreview({ attachmentId, filename, mimeType, size }: {
  attachmentId: string; filename: string; mimeType: string; size: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const url = `/api/attachments/${attachmentId}`
  const isImage = isImageType(mimeType)
  const isViewable = !isImage && isViewableTextType(mimeType, filename)
  const canPreview = isImage || isViewable

  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600,
    border: '1px solid var(--border, #e9ecef)', borderRadius: 20,
    background: 'var(--bg, #fff)', color: 'var(--fg-muted, #6c757d)',
    textDecoration: 'none', cursor: 'pointer', transition: 'all 0.15s',
    fontFamily: 'var(--font-body, sans-serif)',
  } as React.CSSProperties

  const btnHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--primary, #3b5bdb)'
    e.currentTarget.style.color = 'var(--primary, #3b5bdb)'
  }
  const btnLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--border, #e9ecef)'
    e.currentTarget.style.color = 'var(--fg-muted, #6c757d)'
  }

  const hasPopupPreview = isPreviewable(mimeType, filename)

  return (
    <div style={{
      border: '1px solid var(--border, #e9ecef)', borderRadius: 10,
      background: 'var(--muted, #f1f3f5)', margin: '8px 0',
      fontFamily: 'var(--font-body, sans-serif)', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ color: 'var(--fg-muted, #6c757d)', flexShrink: 0 }}>
          {isImage ? <ImageIcon size={26} /> : isViewable ? <FileCode size={26} /> : <FileText size={26} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            onClick={() => hasPopupPreview && setPreviewOpen(true)}
            style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 500,
              color: hasPopupPreview ? 'var(--primary, #3b5bdb)' : 'var(--fg, #1a1a2e)',
              cursor: hasPopupPreview ? 'pointer' : 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: hasPopupPreview ? 'underline decoration-dotted' : 'none'
            }}
            onMouseEnter={e => {
              if (hasPopupPreview) {
                e.currentTarget.style.color = 'var(--primary-hover, #2b4cc4)'
                e.currentTarget.style.textDecoration = 'underline'
              }
            }}
            onMouseLeave={e => {
              if (hasPopupPreview) {
                e.currentTarget.style.color = 'var(--primary, #3b5bdb)'
                e.currentTarget.style.textDecoration = 'underline decoration-dotted'
              }
            }}
          >
            {filename}
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted, #6c757d)' }}>
            {fmtBytes(size)} · {mimeType}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {canPreview && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                ...btnStyle,
                background: expanded ? 'var(--accent, #e8edff)' : 'var(--bg, #fff)',
                borderColor: expanded ? 'var(--primary, #3b5bdb)' : 'var(--border, #e9ecef)',
                color: expanded ? 'var(--primary, #3b5bdb)' : 'var(--fg-muted, #6c757d)',
              }}
              onMouseEnter={btnHover} onMouseLeave={btnLeave}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Sembunyikan' : isImage ? 'Lihat Gambar' : 'Lihat Dokumen'}
            </button>
          )}
          <a href={url} download={filename} style={btnStyle} onMouseEnter={btnHover} onMouseLeave={btnLeave}>
            <Download size={12} /> Unduh
          </a>
        </div>
      </div>

      {expanded && isImage && (
        <div style={{ borderTop: '1px solid var(--border, #e9ecef)', padding: '12px 14px', background: 'var(--bg, #fff)' }}>
          <img src={url} alt={filename} style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 6, display: 'block', objectFit: 'contain' }} />
        </div>
      )}
      {expanded && isViewable && (
        <div style={{ borderTop: '1px solid var(--border, #e9ecef)', background: 'var(--bg, #fff)' }}>
          <TextDocPreview url={url} filename={filename} />
        </div>
      )}
      <AttachmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        attachmentId={attachmentId}
        filename={filename}
        mimeType={mimeType}
        size={size}
      />
    </div>
  )
}

// ── DocContent: renders segments ──────────────────────────────

export function DocContent({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'html') {
          return (
            <div
              key={i}
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
          )
        }
        if (seg.kind === 'attachment') {
          return <AttachmentPreview key={i} {...seg} />
        }
        if (seg.kind === 'diagram') {
          return <DiagramPreview key={i} data={seg.data} />
        }
        return null
      })}
    </>
  )
}
