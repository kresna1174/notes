import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Trash2, ArrowLeft, ChevronRight, Library } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Sidebar } from '#/modules/sidebar'
import { listenForDocumentsChanged } from '#/modules/shared/ui/UploadMenu'
import {
  deleteDocument,
  getDocument,
  getPage,
  type DocumentMetadata,
  type PageResponse,
} from '#/modules/shared/ragApi'

export const Route = createFileRoute('/documents/$documentId')({
  component: DocumentDetailPage,
})

function DocumentDetailPage() {
  const { documentId } = Route.useParams()
  const navigate = useNavigate()
  const [document, setDocument] = useState<DocumentMetadata | null>(null)
  const [pages, setPages] = useState<Array<PageResponse>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const loadDocument = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const nextDocument = await getDocument(documentId)
      setDocument(nextDocument)

      if (nextDocument.status === 'ready') {
        const nextPages = await Promise.all(
          Array.from({ length: nextDocument.total_pages }, (_, pageNumber) =>
            getPage(nextDocument.id, pageNumber),
          ),
        )
        setPages(nextPages)
      } else {
        setPages([])
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load document')
    } finally {
      setIsLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void loadDocument()
    return listenForDocumentsChanged(() => void loadDocument())
  }, [loadDocument])

  async function handleDelete() {
    if (!document) return

    const confirmed = window.confirm(`Delete ${document.name}?`)
    if (!confirmed) return

    setIsDeleting(true)
    setError(null)
    try {
      await deleteDocument(document.id)
      navigate({ to: '/documents' })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete document')
    } finally {
      setIsDeleting(false)
    }
  }

  const statusColors = {
    processing: { bg: 'rgba(240, 140, 0, 0.1)', fg: '#f08c00', border: 'rgba(240, 140, 0, 0.2)' },
    ready: { bg: 'rgba(35, 131, 226, 0.1)', fg: 'var(--primary)', border: 'rgba(35, 131, 226, 0.2)' },
    failed: { bg: 'rgba(235, 87, 87, 0.1)', fg: '#eb5757', border: 'rgba(235, 87, 87, 0.2)' },
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />

      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px', maxWidth: 800, margin: '0 auto' }}>
          {/* Back link */}
          <Link
            to="/documents"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.875rem',
              color: 'var(--fg-muted)',
              marginBottom: 20,
              textDecoration: 'none',
            }}
            className="hover:text-zinc-950 dark:hover:text-zinc-50 transition"
          >
            <ArrowLeft size={16} />
            Back to RAG Engine
          </Link>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)' }}>Loading document…</div>
          ) : error ? (
            <div style={{ padding: '12px 14px', background: 'rgba(235, 87, 87, 0.08)', color: '#eb5757', border: '1px solid rgba(235, 87, 87, 0.2)', borderRadius: 8 }}>
              {error}
            </div>
          ) : document ? (
            <div>
              {/* Header Title with Trash icon */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0, wordBreak: 'break-all' }}>
                    {document.name}
                  </h1>
                  <p style={{ fontSize: '0.85rem', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
                    ID: {document.id}
                  </p>
                </div>
                <button
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    background: 'rgba(235, 87, 87, 0.1)',
                    color: '#eb5757',
                    border: '1px solid rgba(235, 87, 87, 0.2)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                  className="hover:opacity-90 transition"
                >
                  <Trash2 size={14} />
                  Delete File
                </button>
              </div>

              {/* Info Card Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, background: 'var(--muted)', padding: '16px', borderRadius: 10, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 600 }}>Pages Count</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>{document.total_pages}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 600 }}>Uploaded Date</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>
                    {new Date(document.uploaded_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 600 }}>OCR Status</div>
                  <div style={{ marginTop: 4 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '1px 8px',
                        borderRadius: 20,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: (statusColors[document.status] || statusColors.processing).bg,
                        color: (statusColors[document.status] || statusColors.processing).fg,
                        border: `1px solid ${(statusColors[document.status] || statusColors.processing).border}`,
                      }}
                    >
                      {document.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pages list */}
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                  Extracted Pages
                </h2>
                {pages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--fg-muted)' }}>
                    No pages processed yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pages.map((page) => (
                      <Link
                        key={page.page_id}
                        to="/pages/$pageId"
                        params={{ pageId: page.page_id }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--card-bg)',
                          textDecoration: 'none',
                        }}
                        className="hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                      >
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)' }}>Page {page.page_number + 1}</span>
                        <ChevronRight size={16} style={{ color: 'var(--fg-subtle)' }} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
