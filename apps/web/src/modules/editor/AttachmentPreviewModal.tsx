import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../shared/ui'
import { Download, Copy, Check, FileText, Loader2 } from 'lucide-react'
import { marked } from 'marked'

interface AttachmentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isPreviewable(mimeType: string, filename: string): boolean {
  const mime = mimeType.toLowerCase()
  const name = filename.toLowerCase()
  return (
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.js') ||
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.jsx') ||
    name.endsWith('.json') ||
    name.endsWith('.html') ||
    name.endsWith('.css') ||
    name.endsWith('.py') ||
    name.endsWith('.go') ||
    name.endsWith('.rs') ||
    name.endsWith('.sh') ||
    name.endsWith('.yml') ||
    name.endsWith('.yaml') ||
    name.endsWith('.sql')
  )
}

export function AttachmentPreviewModal({
  isOpen,
  onClose,
  attachmentId,
  filename,
  mimeType,
  size
}: AttachmentPreviewModalProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  const isImg = mimeType.toLowerCase().startsWith('image/')
  const isPdf = mimeType.toLowerCase() === 'application/pdf'
  const isMd = filename.toLowerCase().endsWith('.md')
  const isText = !isImg && !isPdf && (mimeType.toLowerCase().startsWith('text/') || isPreviewable(mimeType, filename))

  useEffect(() => {
    if (!isOpen || !attachmentId || (!isText && !isMd)) return

    setLoading(true)
    setContent('')
    fetch(`/api/attachments/${attachmentId}/inline`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch file content')
        return res.text()
      })
      .then(text => {
        setContent(text)
      })
      .catch(err => {
        console.error('Error fetching preview content:', err)
        setContent('Failed to load file preview.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, attachmentId, isText, isMd])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const url = `/api/attachments/${attachmentId}/inline`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border border-border shadow-2xl rounded-xl">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between gap-4 shrink-0 bg-muted/20">
          <div className="flex flex-col gap-0.5 min-w-0">
            <DialogTitle className="text-base font-semibold truncate text-foreground pr-8 flex items-center gap-2">
              <FileText size={18} className="text-primary shrink-0" />
              {filename}
            </DialogTitle>
            <span className="text-xs text-muted-foreground">
              {formatBytes(size)} · {mimeType}
            </span>
          </div>

          <div className="flex items-center gap-2 mr-8">
            {isText && !loading && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    Copy
                  </>
                )}
              </button>
            )}
            <a
              href={`/api/attachments/${attachmentId}`}
              download={filename}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition text-center"
            >
              <Download size={13} />
              Download
            </a>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-6 bg-background/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="animate-spin text-primary" size={32} />
              <span className="text-sm text-muted-foreground">Loading file…</span>
            </div>
          ) : isImg ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <img
                src={url}
                alt={filename}
                className="max-w-full max-h-[60vh] object-contain rounded-lg border border-border bg-muted/10 shadow-sm"
              />
            </div>
          ) : isPdf ? (
            <div className="w-full h-[60vh] rounded-lg border border-border overflow-hidden bg-muted/5 shadow-inner">
              <iframe src={url} className="w-full h-full border-none" title={filename}></iframe>
            </div>
          ) : isMd ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none bg-background p-6 rounded-lg border border-border shadow-inner overflow-auto font-body"
              dangerouslySetInnerHTML={{ __html: marked.parse(content, { breaks: true, gfm: true }) as string }}
              style={{
                fontFamily: 'var(--font-body, inherit)',
                lineHeight: '1.6',
              }}
            />
          ) : isText ? (
            <pre
              className="bg-muted/30 p-6 rounded-lg border border-border shadow-inner overflow-auto font-mono text-xs leading-relaxed text-foreground max-h-[60vh]"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {content}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-sm text-muted-foreground">This file format does not support live preview.</span>
              <a
                href={`/api/attachments/${attachmentId}`}
                download={filename}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
              >
                <Download size={15} />
                Download File
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
