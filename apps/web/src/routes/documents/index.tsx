import { createFileRoute } from '@tanstack/react-router'
import { Library, FileStack, Search, MessageSquare, Trash2, Send, Sparkles, X, ChevronRight, FileText, ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import { Sidebar } from '#/modules/sidebar'
import { UploadMenu } from '#/modules/shared/ui/UploadMenu'
import { listenForDocumentsChanged, notifyDocumentsChanged } from '#/modules/shared/ui/UploadMenu'
import {
  deleteDocument,
  listDocuments,
  listPages,
  searchDocuments,
  askAgent,
  getPage,
  type DocumentMetadata,
  type PageResponse,
  type QueryHit,
} from '#/modules/shared/ragApi'

export const Route = createFileRoute('/documents/')({ component: RAGIndexPage })

function RAGIndexPage() {
  const [activeTab, setActiveTab] = useState<'documents' | 'pages' | 'search' | 'ask-agent'>('documents')
  const [documents, setDocuments] = useState<Array<DocumentMetadata>>([])
  const [pages, setPages] = useState<Array<PageResponse>>([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(true)
  const [isLoadingPages, setIsLoadingPages] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Details state (modals)
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null)
  const [selectedDocPages, setSelectedDocPages] = useState<Array<PageResponse>>([])
  const [isLoadingDocPages, setIsLoadingDocPages] = useState(false)
  const [selectedPage, setSelectedPage] = useState<PageResponse | null>(null)

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDocId, setSearchDocId] = useState('')
  const [searchLimit, setSearchLimit] = useState(5)
  const [searchHits, setSearchHits] = useState<Array<QueryHit>>([])
  const [isSearching, setIsSearching] = useState(false)

  // Ask AI tab state
  const [chatQuery, setChatQuery] = useState('')
  const [chatDocId, setChatDocId] = useState('')
  const [chatAnswer, setChatAnswer] = useState<string | null>(null)
  const [chatHits, setChatHits] = useState<Array<QueryHit>>([])
  const [isAsking, setIsAsking] = useState(false)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocs(true)
    setError(null)
    try {
      const docs = await listDocuments()
      setDocuments(docs)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load documents')
    } finally {
      setIsLoadingDocs(false)
    }
  }, [])

  const loadPages = useCallback(async () => {
    setIsLoadingPages(true)
    setError(null)
    try {
      const allPages = await listPages()
      setPages(allPages)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load pages')
    } finally {
      setIsLoadingPages(false)
    }
  }, [])

  // Load documents on mount
  useEffect(() => {
    void loadDocuments()
    return listenForDocumentsChanged(() => void loadDocuments())
  }, [loadDocuments])

  // Load pages when tab becomes active
  useEffect(() => {
    if (activeTab === 'pages') {
      void loadPages()
    }
  }, [activeTab, loadPages])

  // Load document pages for modal details
  useEffect(() => {
    if (selectedDoc) {
      if (selectedDoc.status === 'ready') {
        setIsLoadingDocPages(true)
        Promise.all(
          Array.from({ length: selectedDoc.total_pages }, (_, pageNumber) =>
            getPage(selectedDoc.id, pageNumber)
          )
        )
          .then(setSelectedDocPages)
          .catch((err) => console.error('Failed to load document pages', err))
          .finally(() => setIsLoadingDocPages(false))
      } else {
        setSelectedDocPages([])
      }
    } else {
      setSelectedDocPages([])
    }
  }, [selectedDoc])

  async function handleDelete(document: DocumentMetadata, e: React.MouseEvent) {
    e.stopPropagation() // Prevent opening modal
    const confirmed = window.confirm(`Delete ${document.name}?`)
    if (!confirmed) return

    setDeletingDocumentId(document.id)
    setError(null)
    try {
      await deleteDocument(document.id)
      notifyDocumentsChanged()
      await loadDocuments()
      if (selectedDoc?.id === document.id) setSelectedDoc(null)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete document')
    } finally {
      setDeletingDocumentId(null)
    }
  }

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setIsSearching(true)
    setError(null)
    try {
      const response = await searchDocuments({
        query: trimmed,
        n_results: searchLimit,
        document_id: searchDocId || undefined,
      })
      setSearchHits(response.hits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  async function submitChat(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = chatQuery.trim()
    if (!trimmed) return

    setIsAsking(true)
    setError(null)
    setChatAnswer(null)
    setChatHits([])
    try {
      const response = await askAgent({
        query: trimmed,
        n_results: 5,
        document_id: chatDocId || undefined,
      })
      setChatAnswer(response.answer)
      setChatHits(response.hits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setIsAsking(false)
    }
  }

  const tabs = [
    { id: 'documents' as const, label: 'Documents', icon: <Library size={14} />, badge: documents.length },
    { id: 'pages' as const, label: 'Pages', icon: <FileStack size={14} />, badge: pages.length },
    { id: 'search' as const, label: 'Search', icon: <Search size={14} /> },
    { id: 'ask-agent' as const, label: 'Ask AI', icon: <MessageSquare size={14} /> },
  ]

  const statusColors = {
    processing: { bg: 'rgba(240, 140, 0, 0.1)', fg: '#f08c00', border: 'rgba(240, 140, 0, 0.2)' },
    ready: { bg: 'rgba(35, 131, 226, 0.1)', fg: 'var(--primary)', border: 'rgba(35, 131, 226, 0.2)' },
    failed: { bg: 'rgba(235, 87, 87, 0.1)', fg: '#eb5757', border: 'rgba(235, 87, 87, 0.2)' },
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    outline: 'none',
    color: 'var(--fg)',
    background: 'var(--input-bg)',
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />

      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: isMobile ? 12 : 8,
              marginBottom: 24,
            }}
          >
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>
                RAG Engine
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Upload, index, and query PDF document references
              </p>
            </div>
            <UploadMenu />
          </div>

          {/* Error Block */}
          {error ? (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 14px',
                background: 'rgba(235, 87, 87, 0.08)',
                color: '#eb5757',
                border: '1px solid rgba(235, 87, 87, 0.2)',
                borderRadius: 8,
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          ) : null}

          {/* Tabs Bar */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setError(null)
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  border: 'none',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  background: activeTab === tab.id ? 'var(--bg)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--fg)' : 'var(--fg-muted)',
                  boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      padding: '0 5px',
                      background: activeTab === tab.id ? 'var(--primary)' : 'var(--border)',
                      color: activeTab === tab.id ? 'var(--primary-fg)' : 'var(--fg-muted)',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab 1: Documents */}
          {activeTab === 'documents' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                Documents List
              </h2>
              {isLoadingDocs ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)', fontSize: '0.875rem' }}>Loading documents…</div>
              ) : documents.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '48px 24px',
                    textAlign: 'center',
                    border: '1px dashed var(--border)',
                    borderRadius: 12,
                    gap: 12,
                  }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-subtle)' }}>
                    <Library size={22} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>No Documents Uploaded</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--fg-muted)' }}>Upload your first PDF to begin indexing pages.</p>
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card-bg)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                    <thead>
                      <tr style={{ background: 'var(--muted)' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'left' }}>File Name</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'left', width: 120 }}>Status</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'right', width: 100 }}>Pages</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'right', width: 100 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => {
                        const colors = statusColors[doc.status] || statusColors.processing
                        return (
                          <tr
                            key={doc.id}
                            style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                            onClick={() => setSelectedDoc(doc)}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition"
                          >
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--fg)' }}>{doc.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>{doc.id}</div>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 8px',
                                  borderRadius: 20,
                                  fontSize: '0.72rem',
                                  fontWeight: 500,
                                  background: colors.bg,
                                  color: colors.fg,
                                  border: `1px solid ${colors.border}`,
                                }}
                              >
                                {doc.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--fg-muted)' }}>
                              {doc.total_pages}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <button
                                onClick={(e) => void handleDelete(doc, e)}
                                disabled={deletingDocumentId === doc.id}
                                style={{
                                  width: 26,
                                  height: 26,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 5,
                                  cursor: 'pointer',
                                  color: 'var(--fg-subtle)',
                                }}
                                className="hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Pages */}
          {activeTab === 'pages' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                OCR Page Chunks
              </h2>
              {isLoadingPages ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)', fontSize: '0.875rem' }}>Loading chunks…</div>
              ) : pages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--fg-muted)' }}>
                  No pages index available. Upload a ready document first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pages.map((p) => (
                    <div
                      key={p.page_id}
                      onClick={() => setSelectedPage(p)}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--card-bg)',
                        cursor: 'pointer',
                      }}
                      className="hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--fg-muted)', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{p.document_name}</span>
                        <span>Page {p.page_number + 1} of {p.total_pages}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg)', lineClamp: 3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                        {p.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Search */}
          {activeTab === 'search' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                Semantic Vector Search
              </h2>

              <form
                onSubmit={(e) => void submitSearch(e)}
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px',
                  marginBottom: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 240px 120px', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Search query</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. bahan bumbu soto banjar"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Source document</label>
                    <select
                      style={inputStyle}
                      value={searchDocId}
                      onChange={(e) => setSearchDocId(e.target.value)}
                    >
                      <option value="">All documents</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Limit</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      max={50}
                      value={searchLimit}
                      onChange={(e) => setSearchLimit(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      fontFamily: 'var(--font-body)',
                      background: 'var(--primary)',
                      color: 'var(--primary-fg)',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      opacity: isSearching ? 0.6 : 1,
                    }}
                  >
                    <Search size={14} /> Search
                  </button>
                </div>
              </form>

              {isSearching ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-muted)' }}>Searching database…</div>
              ) : searchHits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 24px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--fg-muted)' }}>
                  Search results will appear here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {searchHits.map((h) => (
                    <div
                      key={h.page_id}
                      onClick={() => setSelectedPage(h)}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--card-bg)',
                        cursor: 'pointer',
                      }}
                      className="hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--fg-muted)', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{h.document_name}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span>Page {h.page_number + 1}</span>
                          {h.distance !== null && (
                            <span style={{ background: 'var(--muted)', padding: '1px 5px', borderRadius: 4, fontSize: '0.65rem' }}>
                              Distance: {h.distance.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg)', lineClamp: 3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                        {h.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Ask AI */}
          {activeTab === 'ask-agent' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                Ask AI Agent
              </h2>

              <form
                onSubmit={(e) => void submitChat(e)}
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '16px',
                  marginBottom: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 240px', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Your question</label>
                    <input
                      style={inputStyle}
                      placeholder="e.g. ada resep apa saja yang menggunakan ketan putih?"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Context document</label>
                    <select
                      style={inputStyle}
                      value={chatDocId}
                      onChange={(e) => setChatDocId(e.target.value)}
                    >
                      <option value="">All documents</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isAsking || !chatQuery.trim()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      fontFamily: 'var(--font-body)',
                      background: 'var(--primary)',
                      color: 'var(--primary-fg)',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      opacity: isAsking ? 0.6 : 1,
                    }}
                  >
                    <Send size={13} /> Ask AI
                  </button>
                </div>
              </form>

              {isAsking ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px 0',
                    gap: 12,
                    color: 'var(--fg-muted)',
                  }}
                >
                  <div
                    className="animate-spin rounded-full border-4 border-t-transparent"
                    style={{ width: 24, height: 24, borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
                  ></div>
                  <span style={{ fontSize: '0.85rem' }}>AI Agent is drafting your answer…</span>
                </div>
              ) : chatAnswer ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card-bg)' }}>
                    <div style={{ padding: '12px 16px', background: 'var(--muted)', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} color="var(--primary)" /> Answer
                    </div>
                    <div style={{ padding: '20px', fontSize: '0.9rem', color: 'var(--fg)', lineHeight: 1.75 }} className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '16px 0 8px', color: 'var(--fg)' }}>{children}</h1>,
                          h2: ({ children }) => <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '14px 0 8px', color: 'var(--fg)' }}>{children}</h2>,
                          h3: ({ children }) => <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--fg)' }}>{children}</h3>,
                          p: ({ children }) => <p style={{ margin: '0 0 10px', color: 'var(--fg)' }}>{children}</p>,
                          ul: ({ children }) => <ul style={{ listStyleType: 'disc', paddingLeft: 20, margin: '0 0 10px', color: 'var(--fg)' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ listStyleType: 'decimal', paddingLeft: 20, margin: '0 0 10px', color: 'var(--fg)' }}>{children}</ol>,
                          li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                          strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--fg)' }}>{children}</strong>,
                        }}
                      >
                        {chatAnswer}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {chatHits.length > 0 && (
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1rem', color: 'var(--fg)', marginBottom: 12 }}>
                        Sources & Context
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {chatHits.map((h) => (
                          <div
                            key={h.page_id}
                            onClick={() => setSelectedPage(h)}
                            style={{
                              padding: '16px',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              background: 'var(--card-bg)',
                              cursor: 'pointer',
                            }}
                            className="hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                          >
                            <div style={{ display: 'flex', justifyBetween: 'space-between', fontSize: '0.75rem', color: 'var(--fg-muted)', marginBottom: 8 }}>
                              <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{h.document_name}</span>
                              <span>Page {h.page_number + 1} of {h.total_pages}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                              {h.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 24px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--fg-muted)' }}>
                  Type a question above to start chatting with your PDF documents.
                </div>
              )}
            </div>
          )}

          {/* Modal: Document Details */}
          {selectedDoc && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                padding: '16px',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedDoc(null)
              }}
            >
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  width: '100%',
                  maxWidth: 600,
                  maxHeight: '85vh',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Modal Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0, flex: 1, marginRight: 16 }}>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)' }}>
                      {selectedDoc.name}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ID: {selectedDoc.id}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDoc(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Metadata Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--muted)', padding: '12px', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 600 }}>Total Pages</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>{selectedDoc.total_pages}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', textTransform: 'uppercase', fontWeight: 600 }}>Uploaded At</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', marginTop: 2 }}>
                        {new Date(selectedDoc.uploaded_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Document Pages List */}
                  <div>
                    <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg)' }}>Extracted OCR Pages</h4>
                    {isLoadingDocPages ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--fg-muted)', fontSize: '0.8rem' }}>Loading document pages…</div>
                    ) : selectedDocPages.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)' }}>No pages found or processing in progress.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedDocPages.map((page) => (
                          <div
                            key={page.page_id}
                            onClick={() => {
                              setSelectedPage(page)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              background: 'var(--card-bg)',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                            }}
                            className="hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                          >
                            <span style={{ color: 'var(--fg)' }}>Page {page.page_number + 1}</span>
                            <ChevronRight size={14} style={{ color: 'var(--fg-subtle)' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--muted)' }}>
                  <button
                    onClick={() => setSelectedDoc(null)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-body)',
                      background: 'var(--bg)',
                      color: 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Page Details */}
          {selectedPage && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1100, // Show above selectedDoc modal
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                padding: '16px',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedPage(null)
              }}
            >
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  width: '100%',
                  maxWidth: 700,
                  maxHeight: '90vh',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Modal Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0, flex: 1, marginRight: 16 }}>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-heading)' }}>
                      Page {selectedPage.page_number + 1}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Document: {selectedPage.document_name}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPage(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                  <article style={{ fontSize: '0.875rem', color: 'var(--fg)', lineHeight: 1.7 }} className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '16px 0 8px', color: 'var(--fg)' }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '14px 0 8px', color: 'var(--fg)' }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--fg)' }}>{children}</h3>,
                        p: ({ children }) => <p style={{ margin: '0 0 12px', color: 'var(--fg)' }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ listStyleType: 'disc', paddingLeft: 20, margin: '0 0 12px', color: 'var(--fg)' }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ listStyleType: 'decimal', paddingLeft: 20, margin: '0 0 12px', color: 'var(--fg)' }}>{children}</ol>,
                        li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--fg)' }}>{children}</strong>,
                        code: ({ children }) => <code style={{ background: 'var(--inline-code-bg)', color: 'var(--inline-code-fg)', padding: '1px 4px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.85em' }}>{children}</code>,
                        pre: ({ children }) => <pre style={{ background: 'var(--code-bg)', color: 'var(--code-fg)', padding: '12px', borderRadius: 6, overflowX: 'auto', margin: '0 0 12px', fontSize: '0.8em', fontFamily: 'monospace' }}>{children}</pre>,
                      }}
                    >
                      {selectedPage.text}
                    </ReactMarkdown>
                  </article>
                </div>

                {/* Modal Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--muted)' }}>
                  <button
                    onClick={() => setSelectedPage(null)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-body)',
                      background: 'var(--bg)',
                      color: 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
