import { useState, useRef } from 'react'
import { X, Link2, Copy, Check, Trash2, Lock, LockOpen, RefreshCw } from 'lucide-react'
import { useAuth } from '../../lib/auth'

interface Props {
  noteId: string
  initialToken: string | null
  initialHasPin: boolean
  onClose: () => void
  onShareChange: (token: string | null, hasPin: boolean) => void
  onActionSuccess?: () => void
  isTeamNote?: boolean
}

export function ShareModal({ noteId, initialToken, initialHasPin, onClose, onShareChange, onActionSuccess, isTeamNote }: Props) {
  const { user } = useAuth()
  const [activeModalTab, setActiveModalTab] = useState<'public' | 'team'>('public')
  const [actionLoading, setActionLoading] = useState<'copy' | 'move' | null>(null)
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [confirmMove, setConfirmMove] = useState(false)

  const [teamPinEnabled, setTeamPinEnabled] = useState(false)
  const [teamPin, setTeamPin] = useState('')
  const [teamPinError, setTeamPinError] = useState('')
  const teamPinRef = useRef<HTMLInputElement>(null)

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

  async function handleCopyToTeam() {
    if (teamPinEnabled && (!teamPin || !/^\d{4}$/.test(teamPin))) {
      setTeamPinError('PIN harus 4 digit angka')
      teamPinRef.current?.focus()
      return
    }
    setActionLoading('copy')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/copy-to-team`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: teamPinEnabled ? teamPin : null })
      })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil disalin ke Tim!', type: 'success' })
        setTimeout(() => {
          onActionSuccess?.()
          onClose()
        }, 1200)
      } else {
        setActionMessage({ text: data.error || 'Gagal menyalin catatan', type: 'error' })
      }
    } catch {
      setActionMessage({ text: 'Terjadi kesalahan jaringan', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleMoveToTeam() {
    if (teamPinEnabled && (!teamPin || !/^\d{4}$/.test(teamPin))) {
      setTeamPinError('PIN harus 4 digit angka')
      teamPinRef.current?.focus()
      return
    }
    setActionLoading('move')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/move-to-team`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: teamPinEnabled ? teamPin : null })
      })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil dipindahkan ke Tim!', type: 'success' })
        setTimeout(() => {
          onActionSuccess?.()
          onClose()
        }, 1200)
      } else {
        setActionMessage({ text: data.error || 'Gagal memindahkan catatan', type: 'error' })
      }
    } catch {
      setActionMessage({ text: 'Terjadi kesalahan jaringan', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCopyToPersonal() {
    setActionLoading('copy')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/copy-to-personal`, { method: 'POST' })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil disalin ke catatan Saya!', type: 'success' })
        setTimeout(() => {
          onActionSuccess?.()
          onClose()
        }, 1200)
      } else {
        setActionMessage({ text: data.error || 'Gagal menyalin catatan', type: 'error' })
      }
    } catch {
      setActionMessage({ text: 'Terjadi kesalahan jaringan', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleMoveToPersonal() {
    setActionLoading('move')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/move-to-personal`, { method: 'POST' })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil dipindahkan ke catatan Saya!', type: 'success' })
        setTimeout(() => {
          onActionSuccess?.()
          onClose()
        }, 1200)
      } else {
        setActionMessage({ text: data.error || 'Gagal memindahkan catatan', type: 'error' })
      }
    } catch {
      setActionMessage({ text: 'Terjadi kesalahan jaringan', type: 'error' })
    } finally {
      setActionLoading(null)
    }
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
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Bagikan catatan ini secara publik atau dengan tim</p>
          </div>
        </div>

        {/* Tab switcher inside ShareModal */}
        {user?.teamId && (
          <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 8, padding: 3, marginBottom: 20 }}>
            <button
              onClick={() => { setActiveModalTab('public'); setActionMessage(null) }}
              style={{
                flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: activeModalTab === 'public' ? 600 : 400,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: activeModalTab === 'public' ? 'var(--bg)' : 'transparent',
                color: activeModalTab === 'public' ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: activeModalTab === 'public' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              Publik
            </button>
            <button
              onClick={() => { setActiveModalTab('team'); setActionMessage(null) }}
              style={{
                flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: activeModalTab === 'team' ? 600 : 400,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: activeModalTab === 'team' ? 'var(--bg)' : 'transparent',
                color: activeModalTab === 'team' ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: activeModalTab === 'team' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {isTeamNote ? 'Saya' : 'Tim'}
            </button>
          </div>
        )}

        {activeModalTab === 'public' ? (
          <>
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
                      transition: 'all 0.15s',
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
          </>
        ) : (
          user?.teamId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg-muted)', lineHeight: 1.4, fontFamily: 'var(--font-body)' }}>
                {isTeamNote
                  ? 'Tarik catatan ini ke catatan pribadi kamu. Kamu bisa menyalin catatan ini (membuat salinan baru di tab Saya) atau memindahkannya sepenuhnya ke ruang kerja Saya.'
                  : 'Bagikan catatan ini dengan tim kamu. Kamu bisa menyalin catatan ini (membuat salinan baru di tab Tim) atau memindahkannya sepenuhnya ke ruang kerja Tim.'}
              </p>

              {!isTeamNote && (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--muted)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {teamPinEnabled ? <Lock size={14} color="var(--primary)" /> : <LockOpen size={14} color="var(--fg-muted)" />}
                      <div>
                        <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Proteksi PIN Tim</p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
                          {teamPinEnabled ? 'Butuh PIN untuk membuka catatan tim ini' : 'Semua anggota tim bisa langsung baca'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setTeamPinEnabled(v => !v); setTeamPinError(''); setTeamPin('') }}
                      style={{
                        width: 40, height: 22,
                        borderRadius: 11,
                        border: 'none',
                        background: teamPinEnabled ? 'var(--primary)' : 'var(--border)',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        top: 3, left: teamPinEnabled ? 21 : 3,
                        width: 16, height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>

                  {teamPinEnabled && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
                        PIN Tim (4 digit)
                      </label>
                      <input
                        ref={teamPinRef}
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={teamPin}
                        placeholder="1234"
                        onChange={e => { setTeamPin(e.target.value.replace(/\D/g, '')); setTeamPinError('') }}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '1rem',
                          letterSpacing: '0.2em',
                          border: `1.5px solid ${teamPinError ? '#e03131' : 'var(--border)'}`,
                          borderRadius: 8,
                          background: 'var(--input-bg)',
                          color: 'var(--fg)',
                          outline: 'none',
                          fontFamily: 'var(--font-heading)',
                        }}
                        onFocus={e => { if (!teamPinError) e.currentTarget.style.borderColor = 'var(--primary)' }}
                        onBlur={e => { if (!teamPinError) e.currentTarget.style.borderColor = 'var(--border)' }}
                      />
                      {teamPinError && <p style={{ margin: '4px 0 0', fontSize: '0.73rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>{teamPinError}</p>}
                    </div>
                  )}
                </>
              )}
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: 8, 
                fontSize: '0.75rem', 
                color: 'var(--fg-muted)',
                cursor: 'pointer',
                userSelect: 'none',
                fontFamily: 'var(--font-body)',
                marginTop: 4,
                lineHeight: 1.4,
              }}>
                <input 
                  type="checkbox" 
                  checked={confirmMove} 
                  onChange={e => setConfirmMove(e.target.checked)} 
                  style={{ marginTop: 2, cursor: 'pointer' }}
                />
                <span>
                  {isTeamNote 
                    ? 'Saya setuju untuk memindahkan catatan ini ke ruang pribadi (catatan akan dihapus dari Tim)'
                    : 'Saya setuju untuk memindahkan catatan ini ke ruang Tim (catatan akan dihapus dari Saya)'}
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  disabled={!!actionLoading}
                  onClick={isTeamNote ? handleCopyToPersonal : handleCopyToTeam}
                  style={{
                    flex: 1, padding: '10px',
                    background: 'var(--muted)', color: 'var(--fg)',
                    border: '1.5px solid var(--border)', borderRadius: 8,
                    fontSize: '0.8125rem', fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.7 : 1,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!actionLoading) e.currentTarget.style.background = 'var(--accent)' }}
                  onMouseLeave={e => { if (!actionLoading) e.currentTarget.style.background = 'var(--muted)' }}
                >
                  {actionLoading === 'copy' ? 'Menyalin…' : (isTeamNote ? 'Salin ke Saya' : 'Salin ke Tim')}
                </button>
                <button
                  disabled={!!actionLoading || !confirmMove}
                  onClick={isTeamNote ? handleMoveToPersonal : handleMoveToTeam}
                  style={{
                    flex: 1, padding: '10px',
                    background: confirmMove ? 'var(--primary)' : 'var(--border)',
                    color: confirmMove ? 'var(--primary-fg)' : 'var(--fg-subtle)',
                    border: 'none', borderRadius: 8,
                    fontSize: '0.8125rem', fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    cursor: (actionLoading || !confirmMove) ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.7 : 1,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!actionLoading && confirmMove) e.currentTarget.style.opacity = '0.9' }}
                  onMouseLeave={e => { if (!actionLoading && confirmMove) e.currentTarget.style.opacity = '1' }}
                >
                  {actionLoading === 'move' ? 'Memindahkan…' : (isTeamNote ? 'Pindahkan ke Saya' : 'Pindahkan ke Tim')}
                </button>
              </div>
              {actionMessage && (
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '0.78rem',
                  color: actionMessage.type === 'error' ? '#e03131' : '#2b8a3e',
                  fontFamily: 'var(--font-body)',
                  textAlign: 'center',
                  fontWeight: 500
                }}>
                  {actionMessage.text}
                </p>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
