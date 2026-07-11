import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import { Sidebar } from '#/modules/sidebar'
import { getPageById, type PageResponse } from '#/modules/shared/ragApi'

export const Route = createFileRoute('/pages/$pageId')({
  component: PageDetailPage,
})

function PageDetailPage() {
  const { pageId } = Route.useParams()
  const [page, setPage] = useState<PageResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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

  const loadPage = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setPage(await getPageById(pageId))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load page')
    } finally {
      setIsLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />

      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px', maxWidth: 800, margin: '0 auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)' }}>Loading page…</div>
          ) : error ? (
            <div style={{ padding: '12px 14px', background: 'rgba(235, 87, 87, 0.08)', color: '#eb5757', border: '1px solid rgba(235, 87, 87, 0.2)', borderRadius: 8 }}>
              {error}
            </div>
          ) : page ? (
            <div>
              {/* Back link */}
              <Link
                to="/documents/$documentId"
                params={{ documentId: page.document_id }}
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
                Back to {page.document_name}
              </Link>

              {/* Title Card */}
              <div
                style={{
                  marginBottom: 24,
                  padding: '20px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}
              >
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>
                  Page {page.page_number + 1}
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--fg-subtle)', margin: '4px 0 0' }}>
                  ID: {page.page_id}
                </p>
              </div>

              {/* Markdown Content */}
              <div
                style={{
                  padding: '24px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}
              >
                <article style={{ fontSize: '0.9rem', color: 'var(--fg)', lineHeight: 1.75 }} className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '16px 0 8px', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>{children}</h1>,
                      h2: ({ children }) => <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '14px 0 8px', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>{children}</h3>,
                      p: ({ children }) => <p style={{ margin: '0 0 12px', color: 'var(--fg)' }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ listStyleType: 'disc', paddingLeft: 20, margin: '0 0 12px', color: 'var(--fg)' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ listStyleType: 'decimal', paddingLeft: 20, margin: '0 0 12px', color: 'var(--fg)' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                      strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--fg)' }}>{children}</strong>,
                      code: ({ children }) => <code style={{ background: 'var(--inline-code-bg)', color: 'var(--inline-code-fg)', padding: '1px 4px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.85em' }}>{children}</code>,
                      pre: ({ children }) => <pre style={{ background: 'var(--code-bg)', color: 'var(--code-fg)', padding: '12px', borderRadius: 6, overflowX: 'auto', margin: '0 0 12px', fontSize: '0.8em', fontFamily: 'monospace' }}>{children}</pre>,
                    }}
                  >
                    {page.text}
                  </ReactMarkdown>
                </article>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
