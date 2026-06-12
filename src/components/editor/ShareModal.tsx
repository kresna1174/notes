import { useState, useRef } from 'react'
import { X, Link2, Copy, Check, Trash2, Lock, LockOpen, RefreshCw } from 'lucide-react'

interface Props {
  noteId: string
  initialToken: string | null
  initialHasPin: boolean
  onClose: () => void
  onShareChange: (token: string | null, hasPin: boolean) => void
}

export function ShareModal({ noteId, initialToken, initialHasPin, onClose, onShareChange }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [hasPin, setHasPin] = useState(initialHasPin)
  const [pin, setPin] = useState('')
  const [pinEnabled, setPinEnabled] = useState(initialHasPin)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const pinRef = useRef<HTMLInputElement>(null)

  const shareUrl = token ? `${window.location.origin}/share/${token}` : null

  async function generateLink() {
    setLoading(true)
    setPinError('')
    const pinVal = pinEnabled ? pin : undefined
    if (pinEnabled && (!pin || !/^\d{4}$/.test(pin))) {
      setPinError('PIN harus 4 digit angka')
      setLoading(false)
      pinRef.current?.focus()
      return
    }
    const r = await fetch(`/api/notes/${noteId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinVal ?? null }),
    })
    const data = await r.json()
    setLoading(false)
    if (!r.ok) return
    setToken(data.token)
    setHasPin(data.hasPinProtection)
    onShareChange(data.token, data.hasPinProtection)
  }

  async function updatePin() {
    setLoading(true)
    setPinError('')
    if (pinEnabled && (!pin || !/^\d{4}$/.test(pin))) {
      setPinError('PIN harus 4 digit angka')
      setLoading(false)
      pinRef.current?.focus()
      return
    }
    const r = await fetch(`/api/notes/${noteId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinEnabled ? pin : null }),
    })
    const data = await r.json()
    setLoading(false)
    if (!r.ok) return
    setHasPin(data.hasPinProtection)
    setPin('')
    onShareChange(token, data.hasPinProtection)
  }

  async function revokeLink() {
    if (!window.confirm('Cabut link berbagi? Link yang sudah dibagikan tidak bisa digunakan lagi.')) return
    setLoading(true)
    await fetch(`/api/notes/${noteId}/share`, { method: 'DELETE' })
    setLoading(false)
    setToken(null)
    setHasPin(false)
    setPinEnabled(false)
    setPin('')
    onShareChange(null, false)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '28px 28px 24px',
        width: 420,
        maxWidth: '95vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-muted)', display: 'flex', padding: 4, borderRadius: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <X size={16} />
        </button>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Link2 size={18} color="var(--primary)" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>Bagikan Catatan</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Siapapun dengan link bisa membaca</p>
          </div>
        </div>

        {/* PIN toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'var(--muted)',
          borderRadius: 10,
          marginBottom: pinEnabled ? 8 : 16,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pinEnabled ? <Lock size={14} color="var(--primary)" /> : <LockOpen size={14} color="var(--fg-muted)" />}
            <div>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Proteksi PIN</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
                {pinEnabled ? 'Butuh PIN untuk membuka' : 'Siapapun bisa langsung baca'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setPinEnabled(v => !v); setPinError(''); setPin('') }}
            style={{
              width: 40, height: 22,
              borderRadius: 11,
              border: 'none',
              background: pinEnabled ? 'var(--primary)' : 'var(--border)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 3, left: pinEnabled ? 21 : 3,
              width: 16, height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {pinEnabled && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
              PIN (4 digit)
            </label>
            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              placeholder={hasPin ? '••••  (kosongkan = tidak ganti)' : '1234'}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: '1rem',
                letterSpacing: '0.2em',
                border: `1.5px solid ${pinError ? '#e03131' : 'var(--border)'}`,
                borderRadius: 8,
                background: 'var(--input-bg)',
                color: 'var(--fg)',
                outline: 'none',
                fontFamily: 'var(--font-heading)',
              }}
              onFocus={e => { if (!pinError) e.currentTarget.style.borderColor = 'var(--primary)' }}
              onBlur={e => { if (!pinError) e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            {pinError && <p style={{ margin: '4px 0 0', fontSize: '0.73rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>{pinError}</p>}
          </div>
        )}

        {/* Link area */}
        {token ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px',
              background: 'var(--input-bg)',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <span style={{
                flex: 1, fontSize: '0.78rem', color: 'var(--fg-muted)',
                fontFamily: 'var(--font-body)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {shareUrl}
              </span>
              <button
                onClick={copyLink}
                title="Salin link"
                style={{
                  flexShrink: 0, padding: '4px 8px',
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.72rem', fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: copied ? 'var(--accent)' : 'var(--bg)',
                  color: copied ? 'var(--primary)' : 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Disalin' : 'Salin'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* update pin */}
              <button
                onClick={updatePin}
                disabled={loading}
                style={{
                  flex: 1, padding: '9px 0', fontSize: '0.8rem', fontWeight: 600,
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg)', color: 'var(--fg-muted)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
              >
                <RefreshCw size={12} /> Perbarui PIN
              </button>

              {/* revoke */}
              <button
                onClick={revokeLink}
                disabled={loading}
                style={{
                  flex: 1, padding: '9px 0', fontSize: '0.8rem', fontWeight: 600,
                  border: '1px solid rgba(224,49,49,0.3)', borderRadius: 8,
                  background: 'rgba(224,49,49,0.05)', color: '#e03131',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.05)')}
              >
                <Trash2 size={12} /> Cabut Link
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={generateLink}
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', fontSize: '0.875rem', fontWeight: 600,
              border: 'none', borderRadius: 8,
              background: 'var(--primary)', color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: 'var(--font-body)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Link2 size={14} />
            {loading ? 'Membuat link…' : 'Buat Link Berbagi'}
          </button>
        )}
      </div>
    </div>
  )
}
