import { useState, useCallback } from 'react'
import { Zap, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { ingestNoteToWiki } from './WikiAPI'

interface WikiIngestButtonProps {
  noteId: string
  noteTitle: string
  noteContent: string
  /** Optional: compact icon-only mode for embedding inside a toolbar */
  compact?: boolean
}

type IngestStatus = 'idle' | 'confirming' | 'ingesting' | 'success' | 'error'

export function WikiIngestButton({
  noteId,
  noteTitle,
  noteContent,
  compact = false,
}: WikiIngestButtonProps) {
  const [status, setStatus] = useState<IngestStatus>('idle')
  const [message, setMessage] = useState('')

  const handleClick = useCallback(() => {
    if (status === 'idle' || status === 'success' || status === 'error') {
      setStatus('confirming')
      setMessage('')
    }
  }, [status])

  const handleConfirm = useCallback(async () => {
    setStatus('ingesting')
    try {
      const result = await ingestNoteToWiki(noteId, noteTitle, noteContent)
      setMessage(result.message || 'Note ingested successfully!')
      setStatus('success')
      // Auto-reset after 3.5 seconds
      setTimeout(() => setStatus('idle'), 3500)
    } catch (e: any) {
      setMessage(e.message || 'Ingest failed. Please try again.')
      setStatus('error')
      // Auto-reset after 4 seconds
      setTimeout(() => setStatus('idle'), 4000)
    }
  }, [noteId, noteTitle, noteContent])

  const handleCancel = useCallback(() => {
    setStatus('idle')
    setMessage('')
  }, [])

  // ── Confirmation Modal ───────────────────────────────────────────────────────
  const modal = status === 'confirming' || status === 'ingesting' ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={status === 'confirming' ? handleCancel : undefined}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          fontFamily: 'var(--font-body)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            color: 'var(--primary)',
          }}
        >
          {status === 'ingesting' ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Zap size={24} />
          )}
        </div>

        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '1.05rem',
            fontWeight: 700,
            color: 'var(--fg)',
            fontFamily: 'var(--font-heading)',
            letterSpacing: '-0.01em',
          }}
        >
          {status === 'ingesting' ? 'Ingesting note…' : 'Ingest into Wiki?'}
        </h2>

        <p
          style={{
            margin: '0 0 20px',
            fontSize: '0.825rem',
            color: 'var(--fg-muted)',
            lineHeight: 1.65,
          }}
        >
          {status === 'ingesting' ? (
            <>The AI is reading <strong style={{ color: 'var(--fg)' }}>"{noteTitle}"</strong> and extracting knowledge into your wiki. This may take a few seconds.</>
          ) : (
            <>The AI will read <strong style={{ color: 'var(--fg)' }}>"{noteTitle}"</strong> and extract summaries, concepts, and entities into your Mindspace Wiki. Existing pages will be updated, new ones created.</>
          )}
        </p>

        {/* Note title pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--muted)',
            border: '1px solid var(--border)',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              flexShrink: 0,
            }}
          >
            <Zap size={14} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)' }}>{noteTitle || 'Untitled'}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)' }}>
              {Math.round(noteContent.length / 5)} est. words
            </div>
          </div>
        </div>

        {status === 'ingesting' ? (
          /* Progress bar animation */
          <div
            style={{
              height: 4,
              borderRadius: 4,
              background: 'var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 4,
                background: 'var(--primary)',
                animation: 'wikiIngestProgress 2.5s ease-in-out infinite',
                transformOrigin: 'left',
              }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleCancel}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--fg-muted)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fg-muted)'; e.currentTarget.style.color = 'var(--fg)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '9px',
                borderRadius: 9,
                border: 'none',
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <Zap size={14} />
              Ingest into Wiki
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null

  // ── Result Toast ─────────────────────────────────────────────────────────────
  const resultToast = (status === 'success' || status === 'error') ? (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 18px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card-bg)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-body)',
        animation: 'fadeInUp 0.2s ease',
        maxWidth: 360,
        minWidth: 240,
      }}
    >
      {status === 'success' ? (
        <CheckCircle2 size={17} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      ) : (
        <AlertCircle size={17} style={{ color: '#ef4444', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
          {status === 'success' ? 'Wiki Updated!' : 'Ingest Failed'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
          {message}
        </div>
      </div>
      <button
        onClick={() => setStatus('idle')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
      >
        <X size={13} />
      </button>
    </div>
  ) : null

  // ── Trigger Button ────────────────────────────────────────────────────────────
  const triggerButton = compact ? (
    <button
      onClick={handleClick}
      title="Ingest this note into the Wiki"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--fg-muted)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)'
        e.currentTarget.style.color = 'var(--primary)'
        e.currentTarget.style.background = 'var(--accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.color = 'var(--fg-muted)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Zap size={14} />
    </button>
  ) : (
    <button
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--muted)',
        color: 'var(--fg-muted)',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)'
        e.currentTarget.style.color = 'var(--primary)'
        e.currentTarget.style.background = 'var(--accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.color = 'var(--fg-muted)'
        e.currentTarget.style.background = 'var(--muted)'
      }}
    >
      <Zap size={13} />
      Ingest Note
    </button>
  )

  return (
    <>
      {triggerButton}
      {modal}
      {resultToast}
      <style>{`
        @keyframes wikiIngestProgress {
          0%   { transform: scaleX(0); }
          50%  { transform: scaleX(0.85); }
          100% { transform: scaleX(1); opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
