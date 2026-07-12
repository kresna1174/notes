import { useEffect, useState } from 'react'
import { FileText, Upload, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { listDocuments, type DocumentMetadata } from '#/modules/shared/ragApi'

interface RagDocPanelProps {
  pinnedDocs: { id: string; name: string }[]
  onToggle: (doc: { id: string; name: string }) => void
}

export function RagDocPanel({ pinnedDocs, onToggle }: RagDocPanelProps) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const load = () => {
      listDocuments()
        .then(all => setDocs(all.filter(d => d.status === 'ready')))
        .catch(console.error)
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const pinnedIds = new Set(pinnedDocs.map(d => d.id))

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
            return (
              <button
                key={doc.id}
                onClick={() => onToggle({ id: doc.id, name: doc.name })}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: `1px solid ${isPinned ? 'var(--primary)' : 'transparent'}`,
                  background: isPinned ? 'var(--accent)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 2,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  if (!isPinned) e.currentTarget.style.background = 'var(--muted)'
                }}
                onMouseLeave={e => {
                  if (!isPinned) e.currentTarget.style.background = 'none'
                }}
              >
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
              </button>
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
  )
}
