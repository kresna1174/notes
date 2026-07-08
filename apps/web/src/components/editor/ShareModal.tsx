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

  const [selectedOrgId, setSelectedOrgId] = useState<string>(user?.organizations?.[0]?.id || '')

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
      body: JSON.stringify({ pin: pinVal })
    })
    const data = await r.json()
    setLoading(false)
    if (r.ok) {
      setToken(data.token)
      setHasPin(!!pinVal)
      onShareChange(data.token, !!pinVal)
    } else {
      alert(data.error || 'Gagal generate link')
    }
  }

  async function removeLink() {
    if (!window.confirm('Hapus link sharing publik?')) return
    setLoading(true)
    const r = await fetch(`/api/notes/${noteId}/share`, { method: 'DELETE' })
    setLoading(false)
    if (r.ok) {
      setToken(null)
      setHasPin(false)
      setPin('')
      setPinEnabled(false)
      onShareChange(null, false)
    } else {
      alert('Gagal menghapus link')
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCopyToOrg() {
    if (!isTeamNote && !selectedOrgId) {
      alert('Pilih organisasi terlebih dahulu')
      return
    }
    if (teamPinEnabled && (!teamPin || !/^\d{4}$/.test(teamPin))) {
      setTeamPinError('PIN harus 4 digit angka')
      teamPinRef.current?.focus()
      return
    }
    setActionLoading('copy')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/copy-to-organization`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrgId, pin: teamPinEnabled ? teamPin : null })
      })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil disalin ke Organisasi!', type: 'success' })
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

  async function handleMoveToOrg() {
    if (!isTeamNote && !selectedOrgId) {
      alert('Pilih organisasi terlebih dahulu')
      return
    }
    if (teamPinEnabled && (!teamPin || !/^\d{4}$/.test(teamPin))) {
      setTeamPinError('PIN harus 4 digit angka')
      teamPinRef.current?.focus()
      return
    }
    setActionLoading('move')
    setActionMessage(null)
    try {
      const r = await fetch(`/api/notes/${noteId}/move-to-organization`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrgId, pin: teamPinEnabled ? teamPin : null })
      })
      const data = await r.json()
      if (r.ok) {
        setActionMessage({ text: 'Catatan berhasil dipindahkan ke Organisasi!', type: 'success' })
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
        borderRadius: 14,
        padding: '24px',
        width: '90%',
        maxWidth: 420,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 18, right: 18,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', width: 28, height: 28, borderRadius: 6,
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)',
          }}>
            <Link2 size={18} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>Bagikan Catatan</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Bagikan catatan ini secara publik atau dengan organisasi</p>
          </div>
        </div>

        {/* Tab switcher inside ShareModal */}
        {user?.organizations && user.organizations.length > 0 && (
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
              {isTeamNote ? 'Saya' : 'Organisasi'}
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
                    {pinEnabled ? 'Butuh PIN 4 digit untuk melihat catatan' : 'Semua orang dengan link bisa melihat'}
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

            {/* PIN Input if enabled */}
            {pinEnabled && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
                  Masukkan PIN (4 digit)
                </label>
                <input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  placeholder="1234"
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

            {/* Sharing link status */}
            {shareUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', background: 'var(--input-bg)',
                  border: '1px solid var(--border)', borderRadius: 8,
                }}>
                  <input
                    readOnly value={shareUrl}
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      color: 'var(--fg)', fontSize: '0.8125rem', outline: 'none',
                      fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  />
                  {hasPin && <Lock size={12} color="var(--fg-muted)" />}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={copyLink}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '9px 0', background: 'var(--primary)', color: 'var(--primary-fg)',
                      border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Tersalin!' : 'Salin Link'}
                  </button>
                  <button
                    onClick={generateLink} disabled={loading}
                    title="Perbarui Link (Hasilkan Token Baru)"
                    style={{
                      width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--muted)', color: 'var(--fg-muted)',
                      border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={removeLink} disabled={loading}
                    title="Hapus Link Sharing"
                    style={{
                      width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(224,49,49,0.05)', color: '#e03131',
                      border: '1px solid rgba(224,49,49,0.2)', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={generateLink} disabled={loading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 0', background: 'var(--primary)', color: 'var(--primary-fg)',
                  border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Membuat link…' : 'Aktifkan Sharing Publik'}
              </button>
            )}
          </>
        ) : (
          user?.organizations && user.organizations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg-muted)', lineHeight: 1.4, fontFamily: 'var(--font-body)' }}>
                {isTeamNote
                  ? 'Tarik catatan ini ke catatan pribadi kamu. Kamu bisa menyalin catatan ini (membuat salinan baru di tab Saya) atau memindahkannya sepenuhnya ke ruang kerja Saya.'
                  : 'Bagikan catatan ini dengan organisasi kamu. Kamu bisa menyalin catatan ini (membuat salinan baru di tab Organisasi) atau memindahkannya sepenuhnya ke ruang kerja Organisasi.'}
              </p>

              {!isTeamNote && (
                <>
                  {/* Select Organization */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
                      Pilih Organisasi Target
                    </label>
                    <select
                      value={selectedOrgId}
                      onChange={e => setSelectedOrgId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-body)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--input-bg)',
                        color: 'var(--fg)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {user.organizations.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>

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
                        <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Proteksi PIN Organisasi</p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
                          {teamPinEnabled ? 'Butuh PIN untuk membuka catatan organisasi ini' : 'Semua anggota organisasi bisa langsung baca'}
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
                        PIN Organisasi (4 digit)
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
                    ? 'Saya setuju untuk memindahkan catatan ini ke ruang pribadi (catatan akan dihapus dari Organisasi)'
                    : 'Saya setuju untuk memindahkan catatan ini ke ruang Organisasi (catatan akan dihapus dari Saya)'}
                </span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  disabled={!!actionLoading}
                  onClick={isTeamNote ? handleCopyToPersonal : handleCopyToOrg}
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
                  {actionLoading === 'copy' ? 'Menyalin…' : (isTeamNote ? 'Salin ke Saya' : 'Salin ke Org')}
                </button>
                <button
                  disabled={!!actionLoading || !confirmMove}
                  onClick={isTeamNote ? handleMoveToPersonal : handleMoveToOrg}
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
                  {actionLoading === 'move' ? 'Memindahkan…' : (isTeamNote ? 'Pindahkan ke Saya' : 'Pindahkan ke Org')}
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
