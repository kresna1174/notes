import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { useState, useEffect, useRef } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Trash2, UserPlus, Shield, Eye, KeyRound, Lock, LockOpen, X, AlertTriangle, Check, Users as UsersIcon, RefreshCw } from 'lucide-react'

interface User { id: string; username: string; role: 'admin' | 'viewer'; status: 'approved' | 'rejected' | 'pending'; createdAt: number }
interface LockedNote { id: string; title: string; createdAt: number; updatedAt: number; ownerUsername: string; ownerId: string; type: string; organizationId: string | null }

export const Route = createFileRoute('/users')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user || context.auth.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  loader: async () => {
    const res = await fetch('/api/auth/users')
    if (!res.ok) return [] as User[]
    const data = await res.json()
    return (Array.isArray(data) ? data : []) as User[]
  },
  component: UsersPage,
})

// ── Reset PIN Modal ──────────────────────────────────────────────────────────
interface ResetPinModalProps {
  note: LockedNote
  onClose: () => void
  onSuccess: (noteId: string, action: 'removed' | 'changed') => void
}

function ResetPinModal({ note, onClose, onSuccess }: ResetPinModalProps) {
  const [mode, setMode] = useState<'choose' | 'remove' | 'change'>('choose')
  const [digits, setDigits] = useState(['', '', '', ''])
  const [pinError, setPinError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const digitRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  // Focus first digit when entering change mode
  useEffect(() => {
    if (mode === 'change') {
      setTimeout(() => digitRefs[0].current?.focus(), 50)
    }
  }, [mode])

  function handleDigitChange(i: number, val: string) {
    const ch = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = ch
    setDigits(next)
    setPinError('')
    // Auto-advance
    if (ch && i < 3) digitRefs[i + 1].current?.focus()
    // Auto-submit on last digit
    if (ch && i === 3) {
      const pin = next.join('')
      if (pin.length === 4) submitNewPin(pin)
    }
  }

  function handleDigitKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      digitRefs[i - 1].current?.focus()
    }
  }

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  async function handleRemove() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/notes/${note.id}/pin`, { method: 'DELETE' })
      if (res.ok) {
        onSuccess(note.id, 'removed')
        onClose()
      } else {
        const data = await res.json()
        setPinError(data.error || 'Terjadi kesalahan')
      }
    } finally {
      setLoading(false)
    }
  }

  async function submitNewPin(pin: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/notes/${note.id}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (res.ok) {
        onSuccess(note.id, 'changed')
        onClose()
      } else {
        const data = await res.json()
        setPinError(data.error || 'Terjadi kesalahan')
        setDigits(['', '', '', ''])
        triggerShake()
        setTimeout(() => digitRefs[0].current?.focus(), 50)
      }
    } finally {
      setLoading(false)
    }
  }

  function resetChangeMode() {
    setMode('choose')
    setDigits(['', '', '', ''])
    setPinError('')
    setShake(false)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        animation: 'modalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <style>{`
          @keyframes modalIn {
            from { opacity: 0; transform: scale(0.94) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'rgba(224,49,49,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#e03131',
          }}>
            <Lock size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
              Reset PIN Catatan
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{note.title || 'Untitled'}" · @{note.ownerUsername}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)',
              borderRadius: 6, transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Step 1: Choose action */}
          {mode === 'choose' && (
            <>
              {/* Warning banner */}
              <div style={{
                display: 'flex', gap: 10, padding: '12px 14px',
                background: 'rgba(245,159,0,0.08)', border: '1px solid rgba(245,159,0,0.25)',
                borderRadius: 10, marginBottom: 20,
              }}>
                <AlertTriangle size={16} style={{ color: '#f59f00', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                  Aksi ini bersifat <strong>permanen</strong> dan tidak bisa dibatalkan. Pemilik catatan tidak akan mendapat notifikasi.
                </p>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-body)' }}>
                Pilih tindakan
              </p>

              {/* Option: Remove PIN */}
              <button
                onClick={() => setMode('remove')}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', marginBottom: 10,
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  background: 'var(--card-bg)', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e03131'; e.currentTarget.style.background = 'rgba(224,49,49,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(224,49,49,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e03131', flexShrink: 0 }}>
                  <LockOpen size={17} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Hapus PIN</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Catatan bisa dibuka tanpa PIN setelah ini</p>
                </div>
              </button>

              {/* Option: Change PIN */}
              <button
                onClick={() => setMode('change')}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px',
                  border: '1.5px solid var(--border)', borderRadius: 10,
                  background: 'var(--card-bg)', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card-bg)' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                  <KeyRound size={17} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Ganti PIN</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Set PIN baru tanpa perlu PIN lama</p>
                </div>
              </button>
            </>
          )}

          {/* Step 2a: Confirm remove */}
          {mode === 'remove' && (
            <>
              <div style={{
                display: 'flex', gap: 10, padding: '12px 14px',
                background: 'rgba(224,49,49,0.06)', border: '1px solid rgba(224,49,49,0.2)',
                borderRadius: 10, marginBottom: 20,
              }}>
                <AlertTriangle size={16} style={{ color: '#e03131', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                  PIN catatan <strong>"{note.title || 'Untitled'}"</strong> milik <strong>@{note.ownerUsername}</strong> akan dihapus permanen. Siapapun bisa membuka catatan ini tanpa PIN.
                </p>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20, userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  style={{ marginTop: 2, cursor: 'pointer', width: 15, height: 15, accentColor: '#e03131' }}
                />
                <span style={{ fontSize: '0.8125rem', color: 'var(--fg)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                  Saya mengerti dan ingin menghapus PIN catatan ini
                </span>
              </label>

              {pinError && (
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>{pinError}</p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setMode('choose'); setConfirmed(false); setPinError('') }}
                  style={{
                    flex: 1, padding: '9px', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
                    background: 'var(--muted)', color: 'var(--fg-muted)',
                    border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  Kembali
                </button>
                <button
                  onClick={handleRemove}
                  disabled={!confirmed || loading}
                  style={{
                    flex: 1, padding: '9px', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                    background: confirmed && !loading ? '#e03131' : 'var(--border)',
                    color: confirmed && !loading ? '#fff' : 'var(--fg-subtle)',
                    border: 'none', borderRadius: 8,
                    cursor: !confirmed || loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {loading ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Menghapus…</> : <><LockOpen size={13} /> Hapus PIN</>}
                </button>
              </div>
            </>
          )}

          {/* Step 2b: Set new PIN — kotak digit seperti PinLockModal */}
          {mode === 'change' && (
            <>
              {/* Icon + judul centered */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={24} color="var(--primary)" />
                </div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>Buat PIN Baru</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)', textAlign: 'center' }}>
                  4 digit angka untuk catatan
                  <strong style={{ color: 'var(--fg)' }}> "{note.title || 'Untitled'}"</strong>
                </p>
              </div>

              {/* 4 digit boxes */}
              <div style={{
                display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8,
                animation: shake ? 'pin-shake 0.4s ease' : undefined,
              }}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={digitRefs[i]}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleDigitKeyDown(i, e)}
                    disabled={loading}
                    style={{
                      width: 56, height: 64,
                      textAlign: 'center', fontSize: '1.75rem', fontWeight: 700,
                      fontFamily: 'var(--font-heading)',
                      border: `2px solid ${pinError ? '#e03131' : d ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 12,
                      background: 'var(--input-bg)',
                      color: 'var(--fg)',
                      outline: 'none',
                      transition: 'border-color 0.15s, transform 0.1s',
                      caretColor: 'transparent',
                      transform: d ? 'scale(1.04)' : 'scale(1)',
                    }}
                    onFocus={e => { if (!pinError) e.currentTarget.style.borderColor = 'var(--primary)' }}
                    onBlur={e => { if (!d && !pinError) e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                ))}
              </div>

              {/* Error or hint */}
              <div style={{ minHeight: 22, textAlign: 'center', marginBottom: 20 }}>
                {pinError
                  ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>{pinError}</p>
                  : loading
                    ? <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Menyimpan…</p>
                    : <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>Otomatis tersimpan saat digit ke-4 diisi</p>
                }
              </div>

              <button
                onClick={resetChangeMode}
                style={{
                  width: '100%', padding: '9px', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
                  background: 'var(--muted)', color: 'var(--fg-muted)',
                  border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Kembali
              </button>

              <style>{`
                @keyframes pin-shake {
                  0%, 100% { transform: translateX(0); }
                  20% { transform: translateX(-8px); }
                  40% { transform: translateX(8px); }
                  60% { transform: translateX(-5px); }
                  80% { transform: translateX(5px); }
                }
              `}</style>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
function UsersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const users = Route.useLoaderData()
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' as 'admin' | 'viewer' })
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'pins'>('users')
  const [lockedNotes, setLockedNotes] = useState<LockedNote[]>([])
  const [loadingLocked, setLoadingLocked] = useState(false)
  const [resetTarget, setResetTarget] = useState<LockedNote | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (activeTab === 'pins') loadLockedNotes()
  }, [activeTab])

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToastMsg({ text, type })
    setTimeout(() => setToastMsg(null), 3000)
  }

  async function loadLockedNotes() {
    setLoadingLocked(true)
    try {
      const res = await fetch('/api/admin/locked-notes')
      if (res.ok) setLockedNotes(await res.json())
    } finally {
      setLoadingLocked(false)
    }
  }

  function handleResetSuccess(noteId: string, action: 'removed' | 'changed') {
    if (action === 'removed') {
      setLockedNotes(prev => prev.filter(n => n.id !== noteId))
      showToast('PIN berhasil dihapus — catatan sekarang tidak terkunci')
    } else {
      showToast('PIN berhasil diubah ke PIN baru')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setAdding(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { setError(data.error); return }
    setForm({ username: '', password: '', role: 'viewer' })
    setShowForm(false)
    router.invalidate()
  }

  async function handleApprove(id: string) {
    await fetch(`/api/auth/users/${id}/approve`, { method: 'PUT' })
    router.invalidate()
  }
  async function handleReject(id: string) {
    await fetch(`/api/auth/users/${id}/reject`, { method: 'PUT' })
    router.invalidate()
  }
  async function handleDelete(id: string, username: string) {
    if (!window.confirm(`Hapus user "${username}"?`)) return
    await fetch(`/api/auth/users/${id}`, { method: 'DELETE' })
    router.invalidate()
  }
  async function handleResetPassword(id: string, username: string) {
    const newPw = window.prompt(`Password baru untuk user "${username}" (min 4 karakter):`)
    if (newPw === null) return
    if (newPw.trim().length < 4) { alert('Password minimal 4 karakter!'); return }
    const res = await fetch(`/api/auth/users/${id}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPw.trim() }),
    })
    if (res.ok) { showToast(`Password "${username}" berhasil direset`) }
    else { const d = await res.json(); showToast(d.error || 'Gagal reset password', 'error') }
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: '0.875rem',
    fontFamily: 'var(--font-body)', border: '1px solid var(--border)', borderRadius: 7,
    outline: 'none', color: 'var(--fg)', background: 'var(--input-bg)',
  }

  const tabs = [
    { id: 'users' as const, label: 'Pengguna', icon: <UsersIcon size={14} /> },
    { id: 'pins' as const, label: 'Reset PIN Catatan', icon: <Lock size={14} />, badge: activeTab === 'pins' ? lockedNotes.length : undefined },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px', maxWidth: 680 }}>

          {/* Header */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 8, marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>Admin Panel</h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '4px 0 0' }}>Kelola pengguna dan keamanan catatan</p>
            </div>
            {activeTab === 'users' && (
              <button
                onClick={() => setShowForm(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <UserPlus size={15} /> Tambah User
              </button>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', fontSize: '0.8125rem', fontWeight: activeTab === tab.id ? 600 : 400, border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', background: activeTab === tab.id ? 'var(--bg)' : 'transparent', color: activeTab === tab.id ? 'var(--fg)' : 'var(--fg-muted)', boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
                {tab.icon} {tab.label}
                {tab.badge !== undefined && (
                  <span style={{ minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: activeTab === tab.id ? 'var(--primary)' : 'var(--border)', color: activeTab === tab.id ? 'var(--primary-fg)' : 'var(--fg-muted)', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Pengguna ── */}
          {activeTab === 'users' && (
            <>
              {showForm && (
                <form onSubmit={handleAdd} style={{ background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>Tambah User Baru</p>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <input style={inputBase} placeholder="Username" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                    <input style={inputBase} placeholder="Password" type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['viewer', 'admin'] as const).map(r => (
                      <button key={r} type="button" onClick={() => setForm(f => ({ ...f, role: r }))} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', fontSize: '0.8125rem', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'var(--font-body)', background: form.role === r ? 'var(--accent)' : 'var(--bg)', borderColor: form.role === r ? 'var(--primary)' : 'var(--border)', color: form.role === r ? 'var(--primary)' : 'var(--fg-muted)', fontWeight: form.role === r ? 600 : 400 }}>
                        {r === 'admin' ? <Shield size={12} /> : <Eye size={12} />} {r === 'admin' ? 'Admin' : 'Viewer'}
                      </button>
                    ))}
                  </div>
                  {error && <p style={{ margin: 0, fontSize: '0.8125rem', color: '#e03131' }}>{error}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={adding} style={{ padding: '7px 18px', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: adding ? 0.7 : 1 }}>{adding ? 'Menyimpan…' : 'Simpan'}</button>
                    <button type="button" onClick={() => { setShowForm(false); setError(null) }} style={{ padding: '7px 18px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', background: 'var(--bg)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer' }}>Batal</button>
                  </div>
                </form>
              )}

              {users.some(u => u.status === 'pending') && (
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>Permintaan Pendaftaran</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {users.filter(u => u.status === 'pending').map(u => (
                      <div key={u.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', padding: '12px 16px', gap: isMobile ? 12 : 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-subtle)', flexShrink: 0 }}><Eye size={16} /></div>
                          <div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>{u.username}</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 2 }}>Mendaftar pada {new Date(u.createdAt).toLocaleDateString('id-ID')}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                          <button onClick={() => handleApprove(u.id)} style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>Setujui</button>
                          <button onClick={() => handleReject(u.id)} style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(224,49,49,0.05)', color: '#e03131', border: '1px solid rgba(224,49,49,0.3)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.12)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.05)')}>Tolak</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>Daftar Pengguna</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {users.filter(u => u.status !== 'pending').map(u => (
                    <div key={u.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', padding: '12px 16px', gap: isMobile ? 12 : 8, border: '1px solid var(--border)', borderRadius: 10, background: u.id === user?.userId ? 'var(--accent)' : 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: u.role === 'admin' ? 'var(--accent)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)', flexShrink: 0 }}>
                          {u.role === 'admin' ? <Shield size={16} /> : <Eye size={16} />}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>{u.username}</span>
                            {u.status === 'rejected' && <span style={{ fontSize: '0.7rem', padding: '1px 7px', background: 'rgba(224,49,49,0.1)', color: '#e03131', borderRadius: 20, fontWeight: 500 }}>Ditolak</span>}
                            {u.id === user?.userId && <span style={{ fontSize: '0.7rem', padding: '1px 7px', background: 'var(--primary)', color: 'var(--primary-fg)', borderRadius: 20, fontWeight: 500 }}>Kamu</span>}
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'capitalize', color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)' }}>{u.role}</span>
                        </div>
                      </div>
                      {u.id !== user?.userId && (
                        <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                          {u.status === 'rejected' && (
                            <button onClick={() => handleApprove(u.id)} style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600, background: 'transparent', color: 'var(--primary)', border: '1.5px solid var(--primary)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Aktifkan</button>
                          )}
                          <button onClick={() => handleResetPassword(u.id, u.username)} title="Reset Password" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                            <KeyRound size={15} />
                          </button>
                          <button onClick={() => handleDelete(u.id, u.username)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Tab: Reset PIN Catatan ── */}
          {activeTab === 'pins' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', margin: 0 }}>Catatan Terkunci PIN</h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>Hapus atau ganti PIN catatan manapun sebagai admin.</p>
                </div>
                <button onClick={loadLockedNotes} disabled={loadingLocked} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', opacity: loadingLocked ? 0.6 : 1 }}>
                  <RefreshCw size={13} style={loadingLocked ? { animation: 'spin 0.8s linear infinite' } : {}} />
                  Refresh
                </button>
              </div>

              {loadingLocked ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>Memuat…</div>
              ) : lockedNotes.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <LockOpen size={22} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Tidak ada catatan terkunci</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Semua catatan saat ini tidak menggunakan PIN</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lockedNotes.map(note => (
                    <div key={note.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', padding: '14px 16px', gap: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: 'rgba(224,49,49,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e03131' }}>
                          <Lock size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--fg)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {note.title || 'Untitled'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>@{note.ownerUsername}</span>
                            <span style={{ fontSize: '0.68rem', padding: '1px 7px', borderRadius: 20, fontWeight: 500, background: note.type === 'organization' ? 'var(--accent)' : 'var(--muted)', color: note.type === 'organization' ? 'var(--primary)' : 'var(--fg-subtle)' }}>
                              {note.type === 'organization' ? 'Organisasi' : 'Pribadi'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>
                              {new Date(note.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setResetTarget(note)}
                        title="Kelola PIN catatan ini"
                        style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s', alignSelf: isMobile ? 'flex-end' : 'auto' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                      >
                        <KeyRound size={13} /> Kelola PIN
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Reset PIN Modal */}
      {resetTarget && (
        <ResetPinModal
          note={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={handleResetSuccess}
        />
      )}

      {/* Toast notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toastMsg.type === 'success' ? '#2b8a3e' : '#e03131',
          color: '#fff', padding: '12px 20px', borderRadius: 10,
          fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-body)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'slideUp 0.25s ease',
        }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
          {toastMsg.type === 'success' ? <Check size={15} /> : <X size={15} />}
          {toastMsg.text}
        </div>
      )}
    </div>
  )
}
