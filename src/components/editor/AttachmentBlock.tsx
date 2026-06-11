import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Paperclip, Download, Trash2, FileText } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentNodeView({ node, updateAttributes, deleteNode, editor }: any) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { attachmentId, filename, mimeType, size } = node.attrs

  async function upload(file: File) {
    setUploading(true)
    try {
      const noteId = (editor.storage as any).noteId
      const form = new FormData()
      form.append('file', file)
      form.append('noteId', noteId)
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const data = await res.json()
      updateAttributes({
        attachmentId: data.id,
        filename: data.filename,
        mimeType: data.mimeType,
        size: data.size,
      })
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    if (attachmentId) {
      await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
    }
    deleteNode()
  }

  if (!attachmentId) {
    return (
      <NodeViewWrapper>
        <div
          className={`border-2 border-dashed rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground transition-colors ${
            uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
          }`}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4 shrink-0" />
          {uploading ? 'Uploading...' : 'Click to attach a file'}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]) }}
          />
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div className="border rounded-lg p-3 flex items-center gap-3 bg-muted/30">
        <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(size)} · {mimeType}</p>
        </div>
        <a href={`/api/attachments/${attachmentId}`} download={filename}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Download className="h-4 w-4" />
          </Button>
        </a>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
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
  parseHTML() {
    return [{ tag: 'div[data-type="attachment"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView)
  },
})
