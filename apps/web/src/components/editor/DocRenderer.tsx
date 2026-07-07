import React, { useState } from 'react'
import { marked } from 'marked'
import { FileText, ImageIcon, FileCode, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { AttachmentPreviewModal, isPreviewable } from './AttachmentPreviewModal'

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
          return (
            <div key={i} style={{
              border: '1px solid var(--border, #e9ecef)', borderRadius: 8, padding: '10px 14px',
              background: 'var(--muted, #f1f3f5)', margin: '8px 0', fontSize: '0.85rem',
              color: 'var(--fg-muted, #6c757d)', fontFamily: 'var(--font-body, sans-serif)',
            }}>
              📊 Diagram block — {parseDiagramCount(seg.data)}
            </div>
          )
        }
        return null
      })}
    </>
  )
}
