import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useRef, useState, useEffect } from 'react'
import { Paperclip, Download, Trash2, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { AttachmentPreviewModal, isPreviewable } from './AttachmentPreviewModal'

export const pendingFiles = new Map<string, File>()

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string) {
  return mimeType.startsWith('image/')
}

function AttachmentNodeView({ node, updateAttributes, deleteNode, editor }: any) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { attachmentId, filename, mimeType, size, uploadId } = node.attrs

  useEffect(() => {
    if (uploadId && !attachmentId) {
      const file = pendingFiles.get(uploadId)
      if (file) {
        setUploading(true)
        const noteId = (editor.storage as any).noteId
        if (!noteId) {
          console.error('noteId is not set in editor storage')
          deleteNode()
          pendingFiles.delete(uploadId)
          return
        }
        const form = new FormData()
        form.append('file', file)
        form.append('noteId', noteId)
        fetch('/api/attachments', { method: 'POST', body: form })
          .then(async res => {
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
            const data = await res.json()
            updateAttributes({
              attachmentId: data.id,
              filename: data.filename,
              mimeType: data.mimeType,
              size: data.size,
              uploadId: null
            })
            pendingFiles.delete(uploadId)
          })
          .catch(err => {
            alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
            deleteNode()
            pendingFiles.delete(uploadId)
          })
          .finally(() => {
            setUploading(false)
          })
      } else {
        updateAttributes({ uploadId: null })
      }
    }
  }, [uploadId, attachmentId])

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

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    await upload(files[0])
    if (files.length > 1) {
      const noteId = (editor.storage as any).noteId
      for (let i = 1; i < files.length; i++) {
        editor.commands.insertContentAt(editor.state.selection.to, {
          type: 'attachment',
          attrs: { attachmentId: null, filename: '', mimeType: '', size: 0 },
        })
        const form = new FormData()
        form.append('file', files[i])
        form.append('noteId', noteId)
        const res = await fetch('/api/attachments', { method: 'POST', body: form })
        if (res.ok) {
          const data = await res.json()
          updateAttributes({ attachmentId: data.id, filename: data.filename, mimeType: data.mimeType, size: data.size })
        }
      }
    }
  }

  async function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    await upload(files[0])
    if (files.length > 1) {
      const noteId = (editor.storage as any).noteId
      for (let i = 1; i < files.length; i++) {
        const form = new FormData()
        form.append('file', files[i])
        form.append('noteId', noteId)
        const res = await fetch('/api/attachments', { method: 'POST', body: form })
        if (res.ok) {
          const data = await res.json()
          editor.chain().focus().insertContentAt(editor.state.doc.content.size, {
            type: 'attachment',
            attrs: { attachmentId: data.id, filename: data.filename, mimeType: data.mimeType, size: data.size },
          }).run()
        }
      }
    }
    e.target.value = ''
  }

  async function remove() {
    if (attachmentId) await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
    deleteNode()
  }

  if (uploadId && !attachmentId) {
    return (
      <NodeViewWrapper>
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--muted)',
          fontFamily: 'var(--font-body)',
        }}>
          <Loader2 size={24} className="animate-spin text-primary" style={{ flexShrink: 0, color: 'var(--primary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {filename || 'Mengunggah file...'}
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
              {size ? `${formatBytes(size)} · ` : ''}Uploading…
            </p>
          </div>
          <button onClick={deleteNode}
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

  if (!attachmentId) {
    return (
      <NodeViewWrapper>
        <div style={{ position: 'relative' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
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
              {uploading ? 'Uploading…' : dragging ? 'Drop files here' : 'Click or drag & drop files (multiple OK)'}
            </span>
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} disabled={uploading}
              onChange={handleInputChange} />
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

  if (isImage(mimeType)) {
    return (
      <NodeViewWrapper>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={`/api/attachments/${attachmentId}/inline`}
            alt={filename}
            style={{ maxWidth: '100%', borderRadius: 8, display: 'block', border: '1px solid var(--border)', cursor: 'pointer' }}
            onClick={() => setPreviewOpen(true)}
          />
          <div style={{
            position: 'absolute', top: 6, right: 6,
            display: 'flex', gap: 4,
          }}>
            <a
              href={`/api/attachments/${attachmentId}`}
              download={filename}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, color: 'var(--fg-muted)', textDecoration: 'none',
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
              }}
            >
              <Download size={13} color="white" />
            </a>
            <button onClick={remove}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'rgba(224,49,49,0.7)', backdropFilter: 'blur(4px)',
              }}
            >
              <Trash2 size={13} color="white" />
            </button>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 4, fontFamily: 'var(--font-body)' }}>
            <span
              onClick={() => setPreviewOpen(true)}
              style={{
                color: 'var(--primary)',
                cursor: 'pointer',
                textDecoration: 'underline decoration-dotted',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--primary-hover, #2b4cc4)'
                e.currentTarget.style.textDecoration = 'underline'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--primary)'
                e.currentTarget.style.textDecoration = 'underline decoration-dotted'
              }}
            >
              {filename}
            </span>
            <span> · {formatBytes(size)}</span>
          </div>
        </div>
        <AttachmentPreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          attachmentId={attachmentId}
          filename={filename}
          mimeType={mimeType}
          size={size}
        />
      </NodeViewWrapper>
    )
  }

  const canPreview = isPreviewable(mimeType, filename)

  return (
    <NodeViewWrapper>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--muted)',
        fontFamily: 'var(--font-body)',
      }}>
        {isImage(mimeType)
          ? <ImageIcon size={28} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
          : <FileText size={28} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            onClick={() => canPreview && setPreviewOpen(true)}
            style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 500,
              color: canPreview ? 'var(--primary)' : 'var(--fg)',
              cursor: canPreview ? 'pointer' : 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: canPreview ? 'underline decoration-dotted' : 'none'
            }}
            onMouseEnter={e => {
              if (canPreview) {
                e.currentTarget.style.color = 'var(--primary-hover, #2b4cc4)'
                e.currentTarget.style.textDecoration = 'underline'
              }
            }}
            onMouseLeave={e => {
              if (canPreview) {
                e.currentTarget.style.color = 'var(--primary)'
                e.currentTarget.style.textDecoration = 'underline decoration-dotted'
              }
            }}
          >
            {filename}
          </p>
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
      <AttachmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        attachmentId={attachmentId}
        filename={filename}
        mimeType={mimeType}
        size={size}
      />
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
      uploadId: { default: null },
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="attachment"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment' })]
  },
  addNodeView() { return ReactNodeViewRenderer(AttachmentNodeView) },
})
