import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useRef, useState } from 'react'
import { Paperclip, Download, Trash2, FileText } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentNodeView({ node, updateAttributes, deleteNode, editor }: any) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { attachmentId, filename, mimeType, size } = node.attrs

  async function upload(file: File) {
    if (uploading) return
    setUploading(true)
    try {
      const noteId = (editor.storage as any).noteId
      const form = new FormData()
      form.append('file', file)
      form.append('noteId', noteId)
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      updateAttributes({ attachmentId: data.id, filename: data.filename, mimeType: data.mimeType, size: data.size })
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    if (attachmentId) await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
    deleteNode()
  }

  if (!attachmentId) {
    return (
      <NodeViewWrapper>
        <div style={{ position: 'relative' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) upload(file)
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, padding: '16px',
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: dragging ? 'var(--accent)' : 'var(--muted)',
              opacity: uploading ? 0.6 : 1,
              transition: 'border-color 0.15s, background 0.15s',
              fontFamily: 'var(--font-body)',
            }}
          >
            <Paperclip size={16} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--fg-muted)' }}>
              {uploading ? 'Uploading…' : dragging ? 'Drop file here' : 'Click or drag & drop a file'}
            </span>
            <input ref={inputRef} type="file" style={{ display: 'none' }} disabled={uploading}
              onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]) }} />
          </div>
          {!uploading && (
            <button
              onClick={e => { e.stopPropagation(); deleteNode() }}
              title="Hapus"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131'; e.currentTarget.style.borderColor = 'rgba(224,49,49,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--muted)',
        fontFamily: 'var(--font-body)',
      }}>
        <FileText size={28} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>{formatBytes(size)} · {mimeType}</p>
        </div>
        <a href={`/api/attachments/${attachmentId}`} download={filename}
          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: 'var(--fg-muted)', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Download size={15} />
        </a>
        <button onClick={remove}
          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--fg-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

export const AttachmentBlockExtension = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      attachmentId: { default: null },
      filename: { default: '' },
      mimeType: { default: '' },
      size: { default: 0 },
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="attachment"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment' })]
  },
  addNodeView() { return ReactNodeViewRenderer(AttachmentNodeView) },
})
