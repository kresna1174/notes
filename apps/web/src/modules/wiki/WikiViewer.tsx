import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Sidebar } from '#/modules/sidebar'
import {
  getWikiIndex,
  getWikiPage,
  getWikiGraph,
  getWikiLog,
  searchWiki,
  updateWikiPage,
  deleteWikiPage,
  lintWiki,
  type WikiPage,
  type WikiGraph,
  type WikiIngestLog,
  type WikiSearchResult,
  type WikiLintResult,
} from './WikiAPI'
import {
  BookOpen,
  Search,
  Network,
  ArrowLeft,
  Tag,
  Link2,
  Edit3,
  Save,
  X,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Brain,
  Layers,
  Users,
  Lightbulb,
  ChevronRight,
  RefreshCw,
  History,
  Wrench,
  Loader2,
  Zap,
  Info,
  BarChart2,
} from 'lucide-react'
import { ScrollArea } from '#/modules/shared/ui'
import { marked } from 'marked'

// ─── Constants ────────────────────────────────────────────────────────────────

type ViewMode = 'index' | 'page' | 'graph' | 'log'

const CATEGORY_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string; bg: string; darkBg: string }
> = {
  summary: {
    icon: <FileText size={13} />,
    label: 'Summaries',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.10)',
    darkBg: 'rgba(96,165,250,0.15)',
  },
  concept: {
    icon: <Lightbulb size={13} />,
    label: 'Concepts',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.10)',
    darkBg: 'rgba(167,139,250,0.15)',
  },
  entity: {
    icon: <Users size={13} />,
    label: 'Entities',
    color: '#059669',
    bg: 'rgba(5,150,105,0.10)',
    darkBg: 'rgba(52,211,153,0.15)',
  },
  synthesis: {
    icon: <Layers size={13} />,
    label: 'Synthesis',
    color: '#d97706',
    bg: 'rgba(217,119,6,0.10)',
    darkBg: 'rgba(251,191,36,0.15)',
  },
}

const GRAPH_COLORS: Record<string, string> = {
  summary: '#3b82f6',
  concept: '#8b5cf6',
  entity: '#10b981',
  synthesis: '#f59e0b',
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content, { async: false }) as string
  } catch {
    return content
  }
}

function resolveWikiLinks(html: string): string {
  // Replace [[slug]] patterns with clickable anchor tags (click handled via delegation)
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, slug) => {
    return `<a href="#" data-wiki-slug="${slug}" class="wiki-link" style="color:var(--primary);text-decoration:underline;cursor:pointer;">${slug}</a>`
  })
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function Skeleton({ width = '100%', height = 16, style = {} }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: 6,
        background: 'var(--skeleton)',
        ...style,
      }}
    />
  )
}

function IndexSkeleton() {
  return (
    <div style={{ padding: '24px 28px' }}>
      <Skeleton width="55%" height={28} style={{ marginBottom: 8 }} />
      <Skeleton width="35%" height={14} style={{ marginBottom: 24 }} />
      <Skeleton height={36} style={{ marginBottom: 24, borderRadius: 10 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ marginBottom: 20 }}>
          <Skeleton width="25%" height={12} style={{ marginBottom: 10 }} />
          {[1, 2].map(j => (
            <Skeleton key={j} height={64} style={{ marginBottom: 8, borderRadius: 10 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div style={{ padding: '28px 36px' }}>
      <Skeleton width="70%" height={32} style={{ marginBottom: 12 }} />
      <Skeleton width="25%" height={20} style={{ marginBottom: 20 }} />
      {[100, 90, 80, 100, 70, 85].map((w, i) => (
        <Skeleton key={i} width={`${w}%`} height={14} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--fg)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-body)',
            minWidth: 260,
            maxWidth: 360,
            animation: 'fadeInUp 0.2s ease',
          }}
        >
          {t.type === 'success' && <CheckCircle2 size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
          {t.type === 'error' && <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />}
          {t.type === 'info' && <Info size={15} style={{ color: '#3b82f6', flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 2, display: 'flex' }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category, size = 'sm' }: { category: string; size?: 'xs' | 'sm' | 'md' }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.concept
  const pad = size === 'xs' ? '2px 7px' : size === 'sm' ? '3px 9px' : '4px 12px'
  const fs = size === 'xs' ? '0.65rem' : size === 'sm' ? '0.7rem' : '0.75rem'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: pad,
        borderRadius: 20,
        fontSize: fs,
        fontWeight: 600,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.color}22`,
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

// ─── Tag Badge ────────────────────────────────────────────────────────────────

function TagBadge({ tag }: { tag: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: '0.65rem',
        fontWeight: 500,
        color: 'var(--fg-muted)',
        background: 'var(--muted)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <Tag size={9} />
      {tag}
    </span>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyWikiState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 32px',
        textAlign: 'center',
        gap: 0,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          color: 'var(--primary)',
        }}
      >
        <Brain size={30} />
      </div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fg)', margin: '0 0 8px', fontFamily: 'var(--font-heading)' }}>
        Your wiki is empty
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)', margin: '0 0 24px', lineHeight: 1.6, maxWidth: 340 }}>
        Open a note and click <strong>Ingest Note</strong> to let the AI extract concepts, entities, and summaries
        from your notes into a connected knowledge wiki.
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          textAlign: 'left',
          maxWidth: 360,
          fontSize: '0.78rem',
          color: 'var(--fg-muted)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Zap size={13} style={{ color: 'var(--primary)', marginTop: 3, flexShrink: 0 }} />
          <span>Open any note → click <strong style={{ color: 'var(--fg)' }}>Ingest Note</strong> in the editor toolbar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Network size={13} style={{ color: 'var(--primary)', marginTop: 3, flexShrink: 0 }} />
          <span>Pages are automatically linked with <strong style={{ color: 'var(--fg)' }}>[[wikilinks]]</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <BarChart2 size={13} style={{ color: 'var(--primary)', marginTop: 3, flexShrink: 0 }} />
          <span>View the <strong style={{ color: 'var(--fg)' }}>Graph</strong> tab to explore your knowledge map</span>
        </div>
      </div>
    </div>
  )
}

// ─── VIEW 1: Index ────────────────────────────────────────────────────────────

interface IndexViewProps {
  index: Record<string, WikiPage[]>
  loading: boolean
  searchQuery: string
  searchResults: WikiSearchResult[] | null
  searchLoading: boolean
  totalPages: number
  lastUpdated: string | null
  onSearchChange: (q: string) => void
  onOpenPage: (slug: string) => void
  onRefresh: () => void
  onLint: () => void
  lintLoading: boolean
}

function IndexView({
  index,
  loading,
  searchQuery,
  searchResults,
  searchLoading,
  totalPages,
  lastUpdated,
  onSearchChange,
  onOpenPage,
  onRefresh,
  onLint,
  lintLoading,
}: IndexViewProps) {
  const orderedCategories = ['summary', 'concept', 'entity', 'synthesis']

  if (loading) return <IndexSkeleton />

  const isEmpty = totalPages === 0 && !loading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--fg)',
                margin: 0,
                fontFamily: 'var(--font-heading)',
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: 'var(--primary)' }}>
                <Brain size={20} />
              </span>
              Mindspace Wiki
            </h1>
            {totalPages > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{totalPages} page{totalPages !== 1 ? 's' : ''}</span>
                {lastUpdated && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} />
                      Updated {timeAgo(lastUpdated)}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onLint}
              disabled={lintLoading || isEmpty}
              title="Lint / health check wiki"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--muted)', color: 'var(--fg-muted)',
                fontSize: '0.75rem', fontWeight: 600, cursor: isEmpty ? 'default' : 'pointer',
                fontFamily: 'var(--font-body)', opacity: isEmpty ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isEmpty && !lintLoading) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
            >
              {lintLoading ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
              Lint Wiki
            </button>
            <button
              onClick={onRefresh}
              title="Refresh wiki"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--fg-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search wiki pages…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              fontSize: '0.825rem',
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--input-bg)',
              color: 'var(--fg)',
              fontFamily: 'var(--font-body)',
              outline: 'none',
              transition: 'border-color 0.15s',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          {searchLoading && (
            <Loader2
              size={13}
              className="animate-spin"
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--primary)',
              }}
            />
          )}
          {searchQuery && !searchLoading && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)',
                display: 'flex', padding: 2,
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div style={{ padding: '16px 24px 32px' }}>
          {/* Search Results */}
          {searchQuery && (
            <>
              {searchLoading ? (
                [1, 2, 3].map(i => <Skeleton key={i} height={60} style={{ marginBottom: 8, borderRadius: 10 }} />)
              ) : searchResults && searchResults.length > 0 ? (
                <>
                  <p style={{ fontSize: '0.72rem', color: 'var(--fg-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map(r => (
                    <PageCard
                      key={r.slug}
                      slug={r.slug}
                      title={r.title}
                      category={r.category}
                      excerpt={r.excerpt}
                      tags={[]}
                      updatedAt=""
                      onClick={() => onOpenPage(r.slug)}
                    />
                  ))}
                </>
              ) : (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>No results for "{searchQuery}"</p>
                </div>
              )}
            </>
          )}

          {/* Index by Category */}
          {!searchQuery && (
            isEmpty ? (
              <EmptyWikiState />
            ) : (
              orderedCategories.map(cat => {
                const pages = index[cat] ?? []
                if (pages.length === 0) return null
                const meta = CATEGORY_META[cat]
                return (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        marginBottom: 10,
                        paddingBottom: 6,
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ color: meta.color, display: 'flex' }}>{meta.icon}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: 'var(--fg-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                        }}
                      >
                        {meta.label}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.65rem',
                          color: 'var(--fg-subtle)',
                          background: 'var(--muted)',
                          borderRadius: 20,
                          padding: '1px 8px',
                        }}
                      >
                        {pages.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pages.map(page => (
                        <PageCard
                          key={page.slug}
                          slug={page.slug}
                          title={page.title}
                          category={page.category}
                          excerpt={(page.content || '').replace(/[#*`\[\]]/g, '').slice(0, 120)}
                          tags={page.tags}
                          updatedAt={page.updated_at}
                          onClick={() => onOpenPage(page.slug)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Page Card ────────────────────────────────────────────────────────────────

function PageCard({
  slug: _slug,
  title,
  category,
  excerpt,
  tags,
  updatedAt,
  onClick,
}: {
  slug: string
  title: string
  category: string
  excerpt: string
  tags: string[]
  updatedAt: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 5,
        padding: '10px 14px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card-bg)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <CategoryBadge category={category} size="xs" />
          {updatedAt && (
            <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>
              {timeAgo(updatedAt)}
            </span>
          )}
          <ChevronRight size={13} style={{ color: 'var(--fg-subtle)' }} />
        </div>
      </div>
      {excerpt && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--fg-muted)',
            margin: 0,
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {excerpt}
        </p>
      )}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.slice(0, 4).map(t => (
            <TagBadge key={t} tag={t} />
          ))}
          {tags.length > 4 && (
            <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>+{tags.length - 4}</span>
          )}
        </div>
      )}
    </button>
  )
}

// ─── VIEW 2: Page Reader ──────────────────────────────────────────────────────

interface PageViewProps {
  slug: string
  onBack: () => void
  onNavigate: (slug: string) => void
  onToast: (type: Toast['type'], message: string) => void
}

function PageView({ slug, onBack, onNavigate, onToast }: PageViewProps) {
  const [page, setPage] = useState<WikiPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWikiPage(slug)
      setPage(data)
      setEditContent(data.content)
    } catch (e: any) {
      onToast('error', `Failed to load page: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [slug, onToast])

  useEffect(() => { loadPage() }, [loadPage])

  // WikiLink click delegation
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const anchor = target.closest('[data-wiki-slug]') as HTMLElement | null
      if (anchor) {
        e.preventDefault()
        const s = anchor.getAttribute('data-wiki-slug')
        if (s) onNavigate(s)
      }
    }
    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [onNavigate, page])

  async function handleSave() {
    if (!page) return
    setSaving(true)
    try {
      const updated = await updateWikiPage(page.slug, editContent)
      setPage(updated)
      setEditMode(false)
      onToast('success', 'Page saved successfully')
    } catch (e: any) {
      onToast('error', `Failed to save: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!page) return
    setDeleting(true)
    try {
      await deleteWikiPage(page.slug)
      onToast('success', `"${page.title}" deleted`)
      onBack()
    } catch (e: any) {
      onToast('error', `Failed to delete: ${e.message}`)
      setDeleting(false)
    }
  }

  const renderedHTML = useMemo(() => {
    if (!page) return ''
    const withLinks = resolveWikiLinks(page.content || '')
    return renderMarkdown(withLinks)
  }, [page])

  if (loading) return <PageSkeleton />

  if (!page) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: 'var(--fg-muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>Page not found</p>
          <button
            onClick={onBack}
            style={{ marginTop: 12, padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}
          >
            Back to wiki
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page Toolbar */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-muted)',
            fontSize: '0.775rem', fontWeight: 500, cursor: 'pointer',
            fontFamily: 'var(--font-body)', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <ArrowLeft size={13} />
          Back
        </button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>wiki</span>
          <ChevronRight size={12} style={{ color: 'var(--fg-subtle)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{page.title}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {editMode ? (
            <>
              <button
                onClick={() => { setEditMode(false); setEditContent(page.content) }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: '0.775rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: 'var(--primary-fg)', fontSize: '0.775rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: '0.775rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
              >
                <Edit3 size={12} /> Edit
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
                >
                  <Trash2 size={13} />
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#ef4444', fontFamily: 'var(--font-body)' }}>Delete?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  >
                    {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-muted)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  >
                    No
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div style={{ padding: '28px 36px', maxWidth: 780 }}>
          {/* Title + Meta */}
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--fg)',
              margin: '0 0 12px',
              fontFamily: 'var(--font-heading)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {page.title}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <CategoryBadge category={page.category} size="sm" />
            {page.tags.map(t => <TagBadge key={t} tag={t} />)}
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} />
              {formatDate(page.updated_at)}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 24 }} />

          {/* Edit mode */}
          {editMode ? (
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              style={{
                width: '100%',
                minHeight: 400,
                padding: '14px',
                fontSize: '0.875rem',
                fontFamily: 'Menlo, Monaco, Consolas, monospace',
                lineHeight: 1.7,
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--input-bg)',
                color: 'var(--fg)',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          ) : (
            /* Rendered markdown content */
            <div
              ref={contentRef}
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: renderedHTML }}
              style={{ lineHeight: 1.8 }}
            />
          )}

          {/* Source notes */}
          {page.source_note_ids.length > 0 && (
            <div
              style={{
                marginTop: 36,
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--muted)',
              }}
            >
              <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={11} /> Sources
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {page.source_note_ids.map(id => (
                  <span
                    key={id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 20,
                      fontSize: '0.72rem', fontWeight: 500,
                      color: 'var(--primary)',
                      background: 'var(--accent)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FileText size={10} />
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Backlinks */}
          {page.backlinks.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--muted)',
              }}
            >
              <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Link2 size={11} /> Referenced by
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {page.backlinks.map(bl => (
                  <button
                    key={bl}
                    onClick={() => onNavigate(bl)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 20, border: 'none',
                      fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer',
                      color: 'var(--primary)', background: 'var(--accent)',
                      fontFamily: 'var(--font-body)', transition: 'opacity 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <Link2 size={10} />
                    {bl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── VIEW 3: Graph ────────────────────────────────────────────────────────────

interface GraphViewProps {
  onNavigate: (slug: string) => void
  onToast: (type: Toast['type'], message: string) => void
}

interface NodePos {
  x: number
  y: number
  vx: number
  vy: number
  id: string
  title: string
  category: string
  connections: number
}

function GraphView({ onNavigate, onToast }: GraphViewProps) {
  const [graph, setGraph] = useState<WikiGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [nodes, setNodes] = useState<NodePos[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<NodePos[]>([])
  const WIDTH = 800
  const HEIGHT = 560

  useEffect(() => {
    async function load() {
      try {
        const data = await getWikiGraph()
        setGraph(data)
        // Take top 30 most-connected nodes
        const topNodes = [...data.nodes]
          .sort((a, b) => b.connections - a.connections)
          .slice(0, 30)
        const nodeIds = new Set(topNodes.map(n => n.id))

        // Initialize positions using a radial layout by category
        const catGroups: Record<string, string[]> = {}
        topNodes.forEach(n => {
          if (!catGroups[n.category]) catGroups[n.category] = []
          catGroups[n.category].push(n.id)
        })
        const cats = Object.keys(catGroups)
        const initNodes: NodePos[] = topNodes.map(n => {
          const catIdx = cats.indexOf(n.category)
          const angleBase = (catIdx / cats.length) * Math.PI * 2
          const count = catGroups[n.category].length
          const idxInCat = catGroups[n.category].indexOf(n.id)
          const spread = (idxInCat / Math.max(count - 1, 1) - 0.5) * 1.2
          const angle = angleBase + spread * 0.8
          const r = 160 + Math.random() * 80
          return {
            id: n.id,
            title: n.title,
            category: n.category,
            connections: n.connections,
            x: WIDTH / 2 + Math.cos(angle) * r,
            y: HEIGHT / 2 + Math.sin(angle) * r,
            vx: 0,
            vy: 0,
          }
        })
        nodesRef.current = initNodes
        setNodes([...initNodes])

        // Force simulation
        const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
        let tick = 0
        const MAX_TICKS = 200

        function simulate() {
          if (tick >= MAX_TICKS) { cancelAnimationFrame(animRef.current); return }
          tick++
          const ns = nodesRef.current
          const alpha = Math.max(0.02, 0.4 * (1 - tick / MAX_TICKS))

          // Repulsion
          for (let i = 0; i < ns.length; i++) {
            for (let j = i + 1; j < ns.length; j++) {
              const dx = ns[i].x - ns[j].x
              const dy = ns[i].y - ns[j].y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const repStr = 1800 / (dist * dist)
              ns[i].vx += repStr * (dx / dist) * alpha
              ns[i].vy += repStr * (dy / dist) * alpha
              ns[j].vx -= repStr * (dx / dist) * alpha
              ns[j].vy -= repStr * (dy / dist) * alpha
            }
          }

          // Attraction along edges
          const nodeMap = new Map(ns.map(n => [n.id, n]))
          edges.forEach(e => {
            const a = nodeMap.get(e.source)
            const b = nodeMap.get(e.target)
            if (!a || !b) return
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const ideal = 120
            const force = (dist - ideal) * 0.05 * alpha
            a.vx += force * (dx / dist)
            a.vy += force * (dy / dist)
            b.vx -= force * (dx / dist)
            b.vy -= force * (dy / dist)
          })

          // Center gravity
          ns.forEach(n => {
            n.vx += (WIDTH / 2 - n.x) * 0.015 * alpha
            n.vy += (HEIGHT / 2 - n.y) * 0.015 * alpha
            // Damping
            n.vx *= 0.78
            n.vy *= 0.78
            n.x += n.vx
            n.y += n.vy
            // Boundary
            n.x = Math.max(40, Math.min(WIDTH - 40, n.x))
            n.y = Math.max(40, Math.min(HEIGHT - 40, n.y))
          })

          if (tick % 4 === 0) setNodes([...ns])
          animRef.current = requestAnimationFrame(simulate)
        }
        animRef.current = requestAnimationFrame(simulate)
      } catch (e: any) {
        onToast('error', `Failed to load graph: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => cancelAnimationFrame(animRef.current)
  }, [onToast])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
        <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>Building knowledge graph…</p>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 40 }}>
        <Network size={36} style={{ color: 'var(--fg-muted)' }} />
        <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', textAlign: 'center' }}>
          No graph data available yet.<br />Ingest some notes to build your knowledge graph.
        </p>
      </div>
    )
  }

  const topNodeIds = new Set(nodes.map(n => n.id))
  const edges = graph.edges.filter(e => topNodeIds.has(e.source) && topNodeIds.has(e.target))
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const maxConn = Math.max(...nodes.map(n => n.connections), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Graph Legend */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Knowledge Graph
        </span>
        <div style={{ display: 'flex', gap: 12, marginLeft: 4 }}>
          {Object.entries(CATEGORY_META).map(([cat, meta]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: GRAPH_COLORS[cat] }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--fg-muted)' }}>{meta.label}</span>
            </div>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--fg-subtle)' }}>
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Subtle dot grid background */}
          <defs>
            <pattern id="wiki-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="var(--border)" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#wiki-grid)" />

          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodeMap.get(e.source)
            const b = nodeMap.get(e.target)
            if (!a || !b) return null
            const isHighlighted = hoveredNode && (e.source === hoveredNode || e.target === hoveredNode)
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isHighlighted ? 'var(--primary)' : 'var(--border)'}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                strokeOpacity={isHighlighted ? 0.7 : 0.4}
                style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const r = 8 + (n.connections / maxConn) * 18
            const color = GRAPH_COLORS[n.category] ?? '#6b7280'
            const isHovered = hoveredNode === n.id
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(n.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onNavigate(n.id)}
              >
                {/* Glow ring on hover */}
                {isHovered && (
                  <circle
                    r={r + 7}
                    fill={color}
                    opacity={0.18}
                    style={{ pointerEvents: 'none' }}
                  />
                )}
                <circle
                  r={r}
                  fill={color}
                  opacity={hoveredNode && !isHovered ? 0.35 : 0.9}
                  stroke={isHovered ? '#fff' : 'transparent'}
                  strokeWidth={isHovered ? 2 : 0}
                  style={{ transition: 'opacity 0.2s, r 0.2s' }}
                  filter={isHovered ? 'url(#glow)' : undefined}
                />
                {/* Label */}
                <text
                  textAnchor="middle"
                  dy={r + 13}
                  style={{
                    fontSize: isHovered ? '0.65rem' : '0.6rem',
                    fontFamily: 'var(--font-body)',
                    fill: 'var(--fg)',
                    fontWeight: isHovered ? 700 : 400,
                    pointerEvents: 'none',
                    transition: 'font-size 0.1s',
                  }}
                >
                  {n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title}
                </text>
                {/* Connection count badge on hover */}
                {isHovered && (
                  <text
                    textAnchor="middle"
                    dy={4}
                    style={{
                      fontSize: '0.55rem',
                      fontFamily: 'var(--font-body)',
                      fill: '#fff',
                      fontWeight: 700,
                      pointerEvents: 'none',
                    }}
                  >
                    {n.connections}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredNode && (() => {
          const n = nodeMap.get(hoveredNode)
          if (!n) return null
          return (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '8px 14px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: GRAPH_COLORS[n.category], flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>
                {n.title}
              </span>
              <CategoryBadge category={n.category} size="xs" />
              <span style={{ fontSize: '0.7rem', color: 'var(--fg-muted)' }}>{n.connections} links</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', marginLeft: 4 }}>Click to open →</span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── VIEW 4: Log ──────────────────────────────────────────────────────────────

function LogView({ onToast }: { onToast: (type: Toast['type'], message: string) => void }) {
  const [log, setLog] = useState<WikiIngestLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getWikiLog()
        setLog(data)
      } catch (e: any) {
        onToast('error', `Failed to load log: ${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [onToast])

  if (loading) {
    return (
      <div style={{ padding: '20px 24px' }}>
        {[1, 2, 3, 4].map(i => <Skeleton key={i} height={72} style={{ marginBottom: 10, borderRadius: 10 }} />)}
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div style={{ padding: '16px 24px 32px' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Ingest Activity ({log.length})
        </p>
        {log.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <History size={28} style={{ color: 'var(--fg-muted)', marginBottom: 10 }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>No ingest history yet</p>
          </div>
        ) : (
          log.map(entry => {
            const statusColor = entry.status === 'success' ? 'var(--primary)' : entry.status === 'error' ? '#ef4444' : '#f59e0b'
            const statusBg = entry.status === 'success' ? 'rgba(22,163,74,0.1)' : entry.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)'
            return (
              <div
                key={entry.id}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  marginBottom: 8,
                  background: 'var(--card-bg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--fg)' }}>{entry.note_title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: statusBg, color: statusColor, textTransform: 'capitalize' }}>
                      {entry.status}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--fg-subtle)' }}>{timeAgo(entry.created_at)}</span>
                  </div>
                </div>
                {entry.summary && (
                  <p style={{ margin: '0 0 6px', fontSize: '0.75rem', color: 'var(--fg-muted)', lineHeight: 1.5 }}>{entry.summary}</p>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--fg-subtle)' }}>
                    <strong style={{ color: 'var(--primary)' }}>{entry.pages_created}</strong> created
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--fg-subtle)' }}>
                    <strong style={{ color: 'var(--fg-muted)' }}>{entry.pages_updated}</strong> updated
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </ScrollArea>
  )
}

// ─── Lint Modal ───────────────────────────────────────────────────────────────

function LintModal({ result, onClose }: { result: WikiLintResult; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '24px',
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={16} style={{ color: 'var(--primary)' }} />
            Wiki Lint Report
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>

        {result.issues.length === 0 && result.suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 size={28} style={{ color: 'var(--primary)', marginBottom: 8 }} />
            <p style={{ color: 'var(--fg-muted)', fontSize: '0.875rem' }}>Wiki looks healthy! No issues found.</p>
          </div>
        ) : (
          <>
            {result.issues.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={11} /> Issues ({result.issues.length})
                </p>
                {result.issues.map((issue, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 6, fontSize: '0.8rem', color: 'var(--fg)' }}>
                    {issue}
                  </div>
                ))}
              </div>
            )}
            {result.suggestions.length > 0 && (
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Info size={11} /> Suggestions ({result.suggestions.length})
                </p>
                {result.suggestions.map((s, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', marginBottom: 6, fontSize: '0.8rem', color: 'var(--fg)' }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '9px', borderRadius: 8,
            border: 'none', background: 'var(--primary)', color: 'var(--primary-fg)',
            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Main WikiViewer ──────────────────────────────────────────────────────────

export default function WikiViewer() {
  const [view, setView] = useState<ViewMode>('index')
  const [activePage, setActivePage] = useState<string | null>(null)
  const [index, setIndex] = useState<Record<string, WikiPage[]>>({})
  const [indexLoading, setIndexLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WikiSearchResult[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastId, setToastId] = useState(0)
  const [lintLoading, setLintLoading] = useState(false)
  const [lintResult, setLintResult] = useState<WikiLintResult | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compute stats
  const totalPages = useMemo(() => Object.values(index).reduce((s, arr) => s + arr.length, 0), [index])
  const lastUpdated = useMemo(() => {
    const all = Object.values(index).flat()
    if (all.length === 0) return null
    return all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0].updated_at
  }, [index])

  function addToast(type: Toast['type'], message: string) {
    const id = toastId + 1
    setToastId(id)
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  async function loadIndex() {
    setIndexLoading(true)
    try {
      const data = await getWikiIndex()
      setIndex(data)
    } catch (e: any) {
      addToast('error', `Failed to load wiki: ${e.message}`)
    } finally {
      setIndexLoading(false)
    }
  }

  useEffect(() => { loadIndex() }, [])

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!searchQuery.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchWiki(searchQuery)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [searchQuery])

  async function handleLint() {
    setLintLoading(true)
    try {
      const result = await lintWiki()
      setLintResult(result)
    } catch (e: any) {
      addToast('error', `Lint failed: ${e.message}`)
    } finally {
      setLintLoading(false)
    }
  }

  function openPage(slug: string) {
    setActivePage(slug)
    setView('page')
  }

  function goBack() {
    setActivePage(null)
    setView('index')
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 14px',
    borderRadius: 0,
    border: 'none',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--primary)' : 'var(--fg-muted)',
    fontSize: '0.775rem',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    transition: 'color 0.15s, border-color 0.15s',
    marginBottom: -1,
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
        }}
      >
        {/* Tab Bar */}
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--sidebar-bg)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 2,
            flexShrink: 0,
          }}
        >
          <button
            style={tabStyle(view === 'index')}
            onClick={() => { setView('index'); setActivePage(null) }}
            onMouseEnter={e => { if (view !== 'index') e.currentTarget.style.color = 'var(--fg)' }}
            onMouseLeave={e => { if (view !== 'index') e.currentTarget.style.color = 'var(--fg-muted)' }}
          >
            <BookOpen size={14} /> Index
          </button>
          <button
            style={tabStyle(view === 'graph')}
            onClick={() => setView('graph')}
            onMouseEnter={e => { if (view !== 'graph') e.currentTarget.style.color = 'var(--fg)' }}
            onMouseLeave={e => { if (view !== 'graph') e.currentTarget.style.color = 'var(--fg-muted)' }}
          >
            <Network size={14} /> Graph
          </button>
          <button
            style={tabStyle(view === 'log')}
            onClick={() => setView('log')}
            onMouseEnter={e => { if (view !== 'log') e.currentTarget.style.color = 'var(--fg)' }}
            onMouseLeave={e => { if (view !== 'log') e.currentTarget.style.color = 'var(--fg-muted)' }}
          >
            <History size={14} /> Log
          </button>
        </div>

        {/* View Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'index' && (
            <IndexView
              index={index}
              loading={indexLoading}
              searchQuery={searchQuery}
              searchResults={searchResults}
              searchLoading={searchLoading}
              totalPages={totalPages}
              lastUpdated={lastUpdated}
              onSearchChange={setSearchQuery}
              onOpenPage={openPage}
              onRefresh={loadIndex}
              onLint={handleLint}
              lintLoading={lintLoading}
            />
          )}
          {view === 'page' && activePage && (
            <PageView
              slug={activePage}
              onBack={goBack}
              onNavigate={openPage}
              onToast={addToast}
            />
          )}
          {view === 'graph' && (
            <GraphView onNavigate={openPage} onToast={addToast} />
          )}
          {view === 'log' && (
            <LogView onToast={addToast} />
          )}
        </div>
      </main>

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Lint Result Modal */}
      {lintResult && <LintModal result={lintResult} onClose={() => setLintResult(null)} />}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wiki-link { color: var(--primary) !important; text-decoration: underline !important; cursor: pointer !important; }
        .wiki-link:hover { opacity: 0.75; }
      `}</style>
    </div>
  )
}
