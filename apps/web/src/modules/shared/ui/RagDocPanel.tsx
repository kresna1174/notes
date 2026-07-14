import { useEffect, useState } from 'react'
import { FileText, Upload, ChevronLeft, ChevronRight, Check, Trash2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { listDocuments, deleteDocument, type DocumentMetadata } from '#/modules/shared/ragApi'
import { ConfirmDialog } from './ConfirmDialog'

interface RagDocPanelProps {
  pinnedDocs: { id: string; name: string }[]
  onToggle: (doc: { id: string; name: string }) => void
  onPinnedDocDeleted?: (docId: string) => void
}

export function RagDocPanel({ pinnedDocs, onToggle, onPinnedDocDeleted }: RagDocPanelProps) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [hoverDocId, setHoverDocId] = useState<string | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentMetadata | null>(null)

  const loadDocs = () => {
    listDocuments()
      .then(all => setDocs(all.filter(d => d.status === 'ready')))
      .catch(console.error)
  }

  useEffect(() => {
    loadDocs()
    const id = setInterval(loadDocs, 5000)
    return () => clearInterval(id)
  }, [])

  const pinnedIds = new Set(pinnedDocs.map(d => d.id))

  const handleDelete = async (doc: DocumentMetadata) => {
    setDeleteTarget(null)
    setDeletingDocId(doc.id)
    try {
      await deleteDocument(doc.id)
      // Remove from pinned if it was pinned
      if (pinnedIds.has(doc.id)) {
        onPinnedDocDeleted?.(doc.id)
        onToggle({ id: doc.id, name: doc.name })
      }
      loadDocs()
    } catch (err) {
      console.error('[Delete Doc Error]', err)
      alert('Failed to delete document.')
    } finally {
      setDeletingDocId(null)
    }
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand document panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={14} />
        </button>
        {pinnedDocs.length > 0 && (
          <span
            style={{
              marginTop: 8,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              fontSize: '0.6rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {pinnedDocs.length}
          </span>
        )}
      </div>
    )
  }

  return (
    <>
    <div
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 12px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg)' }}>
          Documents
          {pinnedDocs.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                fontSize: '0.62rem',
                fontWeight: 700,
              }}
            >
              {pinnedDocs.length} pinned
            </span>
          )}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Doc list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {docs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 16px',
              textAlign: 'center',
              gap: 10,
            }}
          >
            <Upload size={20} color="var(--fg-subtle)" />
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
              No documents ready.
            </p>
            <Link
              to="/documents"
              style={{
                fontSize: '0.72rem',
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Upload PDF →
            </Link>
          </div>
        ) : (
          docs.map(doc => {
            const isPinned = pinnedIds.has(doc.id)
            const isHovered = hoverDocId === doc.id
            const isDeleting = deletingDocId === doc.id
            return (
              <div
                key={doc.id}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: `1px solid ${isPinned ? 'var(--primary)' : 'transparent'}`,
                  background: isPinned ? 'var(--accent)' : isHovered ? 'var(--muted)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 2,
                  transition: 'all 0.12s',
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
                onClick={() => onToggle({ id: doc.id, name: doc.name })}
                onMouseEnter={() => setHoverDocId(doc.id)}
                onMouseLeave={() => setHoverDocId(null)}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1.5px solid ${isPinned ? 'var(--primary)' : 'var(--border)'}`,
                    background: isPinned ? 'var(--primary)' : 'transparent',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}
                >
                  {isPinned && <Check size={10} color="var(--primary-fg)" strokeWidth={3} />}
                </div>

                <FileText size={13} color={isPinned ? 'var(--primary)' : 'var(--fg-muted)'} style={{ flexShrink: 0 }} />

                {/* Doc name */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: isPinned ? 'var(--fg)' : 'var(--fg-muted)',
                    fontWeight: isPinned ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {doc.name}
                </span>

                {/* Delete button — show on hover */}
                {isHovered && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc) }}
                    disabled={isDeleting}
                    title="Delete document"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      color: 'var(--danger, #e55)',
                      padding: '2px 3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 4,
                      flexShrink: 0,
                      opacity: isDeleting ? 0.4 : 1,
                      transition: 'opacity 0.1s',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>
          Pinned docs auto-attach to every message
        </p>
      </div>
    </div>

    <ConfirmDialog
      open={!!deleteTarget}
      title="Hapus Dokumen"
      description={<>Yakin ingin menghapus <strong style={{ color: 'var(--fg)' }}>"{deleteTarget?.name}"</strong>? Tindakan ini tidak bisa dibatalkan.</>}
      confirmLabel="Hapus"
      cancelLabel="Batal"
      onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget) }}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  )
}
