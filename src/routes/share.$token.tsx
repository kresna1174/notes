import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { PinLockModal } from '../components/editor/PinLockModal'
import { docToSegments, DocContent } from '../components/editor/DocRenderer'
import { Lock, Sun, Moon, Beer } from 'lucide-react'
import { useTheme } from '../lib/theme'

export const Route = createFileRoute('/share/$token')({
  component: ShareViewComponent,
})

function fmt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function ShareViewComponent() {
  const { token } = Route.useParams()
  const { theme, toggle } = useTheme()
  const [note, setNote] = useState<{ id: string; title: string; content: string; createdAt: number; updatedAt: number; hasPinProtection: boolean; createdByUsername?: string | null; updatedByUsername?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setLoading(false)
        if (!data || data.error) { setNotFound(true); return }
        setNote(data)
        if (data.hasPinProtection) setShowPin(true)
        else setUnlocked(true)
      })
  }, [token])

  async function handleVerify(pin: string): Promise<boolean> {
    const r = await fetch(`/api/share/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    if (!r.ok) return false
    setUnlocked(true)
    setShowPin(false)
    return true
  }

  const segments = useMemo(() => {
    if (!note || !unlocked) return []
    try {
      const doc = JSON.parse(note.content)
      return docToSegments(doc, '')
    } catch { return [] }
  }, [note?.content, unlocked])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app, #f8f9fa)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e9ecef', borderTopColor: '#3b5bdb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app, #f8f9fa)', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: 'var(--fg, #1a1a2e)', fontWeight: 600, fontFamily: 'var(--font-heading, sans-serif)' }}>Link tidak ditemukan</p>
        <p style={{ color: 'var(--fg-muted, #6c757d)', fontSize: '0.85rem', fontFamily: 'var(--font-body, sans-serif)' }}>Link ini mungkin sudah dicabut atau tidak valid.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #fff)' }}>
      {/* header bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        borderBottom: '1px solid var(--border, #e9ecef)',
        background: 'var(--bg, #fff)',
        padding: '12px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--accent, #e8edff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #3b5bdb)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg-muted, #6c757d)', fontFamily: 'var(--font-body, sans-serif)' }}>Shared Note</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {note?.hasPinProtection && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--fg-muted, #6c757d)', fontFamily: 'var(--font-body, sans-serif)' }}>
              <Lock size={12} />
              {unlocked ? 'Dibuka' : 'Terkunci'}
            </div>
          )}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to Homebrew theme' : theme === 'homebrew' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--fg-muted, #6c757d)',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted, #6c757d)' }}
          >
            {theme === 'dark' ? <Beer size={14} /> : theme === 'homebrew' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {unlocked ? (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 48px' }}>
          <h1 style={{
            fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2,
            color: 'var(--fg, #1a1a2e)', fontFamily: 'var(--font-heading, sans-serif)',
            marginBottom: 10,
          }}>
            {note?.title || 'Untitled'}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 36, fontSize: '0.75rem', color: 'var(--fg-subtle, #adb5bd)', fontFamily: 'var(--font-body, sans-serif)' }}>
            <span>
              Dibuat <span style={{ color: 'var(--fg-muted, #6c757d)' }}>{note ? fmt(note.createdAt) : ''}</span>
              {note?.createdByUsername && <> oleh <span style={{ color: 'var(--fg-muted, #6c757d)', fontWeight: 500 }}>{note.createdByUsername}</span></>}
            </span>
            <span>·</span>
            <span>
              Diperbarui <span style={{ color: 'var(--fg-muted, #6c757d)' }}>{note ? fmt(note.updatedAt) : ''}</span>
              {note?.updatedByUsername && <> oleh <span style={{ color: 'var(--fg-muted, #6c757d)', fontWeight: 500 }}>{note.updatedByUsername}</span></>}
            </span>
          </div>
          <DocContent segments={segments} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 57px)', flexDirection: 'column', gap: 12 }}>
          <Lock size={32} color="var(--fg-muted, #6c757d)" />
          <p style={{ color: 'var(--fg-muted, #6c757d)', fontSize: '0.9rem', fontFamily: 'var(--font-body, sans-serif)' }}>Catatan ini dilindungi PIN</p>
          <button
            onClick={() => setShowPin(true)}
            style={{
              padding: '8px 20px', fontSize: '0.8rem', fontWeight: 600,
              border: '1px solid var(--primary, #3b5bdb)', borderRadius: 20,
              background: 'var(--accent, #e8edff)', color: 'var(--primary, #3b5bdb)',
              cursor: 'pointer', fontFamily: 'var(--font-body, sans-serif)',
            }}
          >
            Masukkan PIN
          </button>
        </div>
      )}

      {showPin && (
        <PinLockModal mode="unlock" onSubmit={handleVerify} onClose={() => setShowPin(false)} />
      )}
    </div>
  )
}
