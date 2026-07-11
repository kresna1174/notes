import { Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { uploadDocument } from '../ragApi'

const documentsChangedEvent = 'documents:changed'

export function notifyDocumentsChanged() {
  window.dispatchEvent(new Event(documentsChangedEvent))
}

export function listenForDocumentsChanged(callback: () => void) {
  window.addEventListener(documentsChangedEvent, callback)
  return () => window.removeEventListener(documentsChangedEvent, callback)
}

export function UploadMenu() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)

  async function submitFile(file: File) {
    if (file.type !== 'application/pdf') {
      setStatus('PDF files only')
      return
    }

    setIsUploading(true)
    setStatus(`Uploading ${file.name}`)

    try {
      await uploadDocument(file)
      setStatus('Upload queued')
      notifyDocumentsChanged()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-fg)', border: 'none' }}
        onClick={() => setIsOpen((value) => !value)}
        disabled={isUploading}
      >
        <Upload size={14} aria-hidden="true" />
        Upload PDF
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 top-11 z-20 w-80 rounded-lg border p-4 shadow-xl"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Upload PDF</p>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-md transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              style={{ color: 'var(--fg-muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}
              onClick={() => setIsOpen(false)}
              aria-label="Close upload menu"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className={[
              'flex min-h-36 w-full flex-col items-center justify-center rounded-md border border-dashed px-4 text-center transition cursor-pointer',
              isDragging
                ? 'opacity-85'
                : 'hover:opacity-90',
            ].join(' ')}
            style={{
              backgroundColor: isDragging ? 'var(--accent)' : 'var(--input-bg)',
              borderColor: 'var(--border)',
              color: 'var(--fg)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault()
              setIsDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              const [file] = Array.from(event.dataTransfer.files)
              if (file) void submitFile(file)
            }}
            disabled={isUploading}
          >
            <Upload size={20} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
            <span className="mt-3 text-sm font-medium" style={{ color: 'var(--fg)' }}>Drop PDF or browse</span>
            <span className="mt-1 text-xs" style={{ color: 'var(--fg-subtle)' }}>{status || 'Queued for OCR'}</span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void submitFile(file)
              event.currentTarget.value = ''
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
