import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useAuth } from '#/modules/shared/auth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/modules/shared/ui/dialog'
import { Sidebar } from '#/modules/sidebar'
import React, { useState, useEffect, useRef } from 'react'
import { Trash2, UserPlus, Shield, Eye, KeyRound, Lock, LockOpen, X, AlertTriangle, Check, Users as UsersIcon, RefreshCw, Sparkles, Pencil, Plus, UsersRound, UserMinus } from 'lucide-react'

interface User { id: string; username: string; role: 'admin' | 'viewer'; status: string; createdAt: number }
interface LockedNote { id: string; title: string; createdAt: number; updatedAt: number; ownerUsername: string; ownerId: string; type: string; organizationId: string | null }
interface AiSession { session_id: string; user_id: string | null; username: string | null; note_title: string | null; created_at: string; updated_at: string; message_count: number; user_message_count: number; tool_call_count: number; prompt_preview: string; has_error: boolean; error_message: string | null; prompt_tokens: number; completion_tokens: number; messages: { role: string; type: string; content: string; name: string | null; tool_call_id: string | null }[] }
interface AiStats { total_sessions: number; total_messages: number; total_user_messages: number; total_tool_calls: number; total_prompt_tokens: number; total_completion_tokens: number }
interface Organization { id: string; name: string; description: string | null; createdAt: number }

export const Route = createFileRoute('/users/')({
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
  const digitRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

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
    if (ch && i < 3) digitRefs[i + 1].current?.focus()
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
        setPinError(data.error || 'An error occurred')
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
        setPinError(data.error || 'An error occurred')
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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 14,
          padding: 24,
          maxWidth: 420,
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 6,
            cursor: 'pointer', color: 'var(--fg-muted)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <X size={16} />
        </button>

        <DialogHeader className="flex flex-row items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
            <KeyRound size={18} />
          </div>
          <div>
            <DialogTitle className="text-md font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--fg)' }}>
              Security Manager
            </DialogTitle>
            <p style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', margin: 0 }}>Manage note PIN</p>
          </div>
        </DialogHeader>

        <div style={{ marginTop: 16 }}>
          {mode === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 14px', background: 'rgba(240,140,0,0.06)', borderRadius: 8, border: '1px solid rgba(240,140,0,0.15)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={18} color="#f08c00" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                  Managing PIN for note: <strong style={{ color: 'var(--fg)' }}>"{note.title || 'Untitled'}"</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  onClick={handleRemove}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                    background: 'rgba(224,49,49,0.08)', color: '#e03131', border: '1px solid rgba(224,49,49,0.2)', borderRadius: 8,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {loading ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <LockOpen size={13} />}
                  Remove PIN
                </button>
                <button
                  onClick={() => setMode('change')}
                  style={{
                    flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)',
                    background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 8,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <KeyRound size={13} />
                  Change PIN
                </button>
              </div>
            </div>
          )}

          {mode === 'change' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>Set New 4-Digit PIN</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--fg-muted)', textAlign: 'center', fontFamily: 'var(--font-body)' }}>This PIN will lock note "{note.title || 'Untitled'}"</p>
              </div>

              <div
                className={shake ? 'shake-anim' : ''}
                style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24 }}
              >
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={digitRefs[i]}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleDigitKeyDown(i, e)}
                    disabled={loading}
                    style={{
                      width: 48, height: 48,
                      borderRadius: 8,
                      border: '1.5px solid rgba(255, 255, 255, 0.08)',
                      background: 'var(--input-bg)',
                      color: 'var(--fg)',
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      textAlign: 'center',
                      outline: 'none',
                      transition: 'border-color 0.15s, transform 0.1s',
                      caretColor: 'transparent',
                      transform: digit ? 'scale(1.04)' : 'scale(1)',
                    }}
                    onFocus={e => { if (!pinError) e.currentTarget.style.borderColor = 'var(--primary)' }}
                    onBlur={e => { if (!digit && !pinError) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)' }}
                  />
                ))}
              </div>

              <div style={{ minHeight: 22, textAlign: 'center', marginBottom: 20 }}>
                {pinError
                  ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>{pinError}</p>
                  : loading
                    ? <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>Saving…</p>
                    : <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>Automatically saved when 4th digit is filled</p>
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
                Back
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
      </DialogContent>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Dialog>
  )
}

// ── User Action Modal ──────────────────────────────────────────────────────────
interface UserActionModalProps {
  user: User
  action: 'edit' | 'password' | 'delete'
  onClose: () => void
  onDone: () => void
}

function UserActionModal({ user: target, action, onClose, onDone }: UserActionModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [username, setUsername] = useState(target.username)
  const [role, setRole] = useState(target.role)
  const [password, setPassword] = useState('')

  async function handleEdit() {
    setLoading(true); setError('')
    const res = await fetch(`/api/auth/users/${target.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    })
    setLoading(false)
    if (res.ok) { onDone() } else { const d = await res.json(); setError(d.error || 'Failed') }
  }

  async function handlePassword() {
    if (password.trim().length < 4) { setError('Minimal 4 characters'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/auth/users/${target.id}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password.trim() }),
    })
    setLoading(false)
    if (res.ok) { onDone() } else { const d = await res.json(); setError(d.error || 'Failed') }
  }

  async function handleDelete() {
    setLoading(true); setError('')
    const res = await fetch(`/api/auth/users/${target.id}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) { onDone() } else { const d = await res.json(); setError(d.error || 'Failed') }
  }

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, outline: 'none', color: 'var(--fg)', background: 'var(--bg)', transition: 'all 0.15s ease' }
  const btnPrimary: React.CSSProperties = { padding: '8px 18px', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 7, cursor: 'pointer', transition: 'opacity 0.15s' }
  const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#e03131' }
  const btnGhost: React.CSSProperties = { padding: '8px 18px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s' }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        style={{
          background: 'var(--card-bg)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 14,
          padding: 24,
          maxWidth: 400,
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 6,
            cursor: 'pointer', color: 'var(--fg-muted)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <X size={16} />
        </button>

        <DialogHeader className="flex flex-row items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
            {action === 'edit' ? <Pencil size={18} /> : action === 'password' ? <KeyRound size={18} /> : <Trash2 size={18} />}
          </div>
          <div>
            <DialogTitle className="text-md font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--fg)' }}>
              {action === 'edit' ? 'Edit User' : action === 'password' ? 'Change Password' : 'Delete User'}
            </DialogTitle>
            <p style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', margin: 0 }}>@{target.username}</p>
          </div>
        </DialogHeader>

        {/* Body */}
        <div style={{ marginTop: 16 }}>
          {action === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Username</label>
                <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['viewer', 'admin'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRole(r)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0', fontSize: '0.8125rem', borderRadius: 7, border: role === r ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.08)', cursor: 'pointer', fontFamily: 'var(--font-body)', background: role === r ? 'var(--accent)' : 'var(--bg)', color: role === r ? 'var(--primary)' : 'var(--fg-muted)', fontWeight: role === r ? 600 : 400 }}>
                      {r === 'admin' ? <Shield size={13} /> : <Eye size={13} />} {r === 'admin' ? 'Admin' : 'Viewer'}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p style={{ margin: 0, fontSize: '0.8rem', color: '#e03131' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleEdit} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? 'Saving…' : 'Save'}</button>
                <button onClick={onClose} style={btnGhost}>Cancel</button>
              </div>
            </div>
          )}

          {action === 'password' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4, display: 'block' }}>New Password (min 4 characters)</label>
                <input style={inputStyle} type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} autoFocus onKeyDown={e => e.key === 'Enter' && handlePassword()} />
              </div>
              {error && <p style={{ margin: 0, fontSize: '0.8rem', color: '#e03131' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handlePassword} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? 'Saving…' : 'Save'}</button>
                <button onClick={onClose} style={btnGhost}>Cancel</button>
              </div>
            </div>
          )}

          {action === 'delete' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(224,49,49,0.06)', borderRadius: 8, border: '1px solid rgba(224,49,49,0.15)' }}>
                <AlertTriangle size={18} color="#e03131" style={{ flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--fg-muted)', lineHeight: 1.45 }}>Are you sure you want to delete user <strong style={{ color: 'var(--fg)' }}>@{target.username}</strong>? This action cannot be undone.</p>
              </div>
              {error && <p style={{ margin: 0, fontSize: '0.8rem', color: '#e03131' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleDelete} disabled={loading} style={{ ...btnDanger, opacity: loading ? 0.6 : 1 }}>{loading ? 'Deleting…' : 'Remove'}</button>
                <button onClick={onClose} style={btnGhost}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  const [activeTab, setActiveTab] = useState<'users' | 'pins' | 'ai-history' | 'organizations'>('users')
  const [lockedNotes, setLockedNotes] = useState<LockedNote[]>([])
  const [loadingLocked, setLoadingLocked] = useState(false)
  const [resetTarget, setResetTarget] = useState<LockedNote | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [aiLogs, setAiLogs] = useState<AiSession[]>([])
  const [aiLogsTotal, setAiLogsTotal] = useState(0)
  const [aiLogsPage, setAiLogsPage] = useState(1)
  const [aiLogsStats, setAiLogsStats] = useState<AiStats | null>(null)
  const [loadingAiLogs, setLoadingAiLogs] = useState(false)
  const [aiLogFilterUser, setAiLogFilterUser] = useState<string>('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [userModal, setUserModal] = useState<{ user: User; action: 'edit' | 'password' | 'delete' } | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgForm, setOrgForm] = useState({ name: '', description: '' })
  const [savingOrg, setSavingOrg] = useState(false)
  const [editingOrg, setEditingOrg] = useState<{ org: Organization } | null>(null)
  const [editOrgForm, setEditOrgForm] = useState({ name: '', description: '' })
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (activeTab === 'pins') loadLockedNotes()
    if (activeTab === 'ai-history') loadAiLogs()
    if (activeTab === 'organizations') loadOrganizations()
  }, [activeTab, aiLogFilterUser, aiLogsPage])

  async function loadAiLogs() {
    setLoadingAiLogs(true)
    try {
      const params = new URLSearchParams({ page: String(aiLogsPage), page_size: '30' })
      if (aiLogFilterUser) params.set('user_id', aiLogFilterUser)
      const res = await fetch(`/api/admin/ai-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAiLogs(data.sessions || [])
        setAiLogsTotal(data.total || 0)
        setAiLogsStats(data.stats || null)
      }
    } finally {
      setLoadingAiLogs(false)
    }
  }

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
      showToast('PIN removed — note is now unlocked')
    } else {
      showToast('PIN changed to new PIN')
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

  async function handleDelete(id: string, username: string) {
    const target = users.find(u => u.id === id)
    if (target) setUserModal({ user: target, action: 'delete' })
  }
  async function handleResetPassword(id: string, username: string) {
    const target = users.find(u => u.id === id)
    if (target) setUserModal({ user: target, action: 'password' })
  }
  async function handleEditUser(id: string, username: string, currentRole: string) {
    const target = users.find(u => u.id === id)
    if (target) setUserModal({ user: target, action: 'edit' })
  }

  // ── Organization handlers ──
  async function loadOrganizations() {
    setLoadingOrgs(true)
    try {
      const res = await fetch('/api/organizations')
      if (res.ok) setOrganizations(await res.json())
    } finally { setLoadingOrgs(false) }
  }
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault(); setSavingOrg(true)
    await fetch('/api/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orgForm) })
    setSavingOrg(false); setOrgForm({ name: '', description: '' }); setShowOrgForm(false); loadOrganizations()
  }
  async function handleEditOrg(e: React.FormEvent) {
    e.preventDefault(); if (!editingOrg) return; setSavingOrg(true)
    await fetch(`/api/organizations/${editingOrg.org.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editOrgForm) })
    setSavingOrg(false); setEditingOrg(null); loadOrganizations()
  }
  async function handleDeleteOrg(id: string, name: string) {
    if (!window.confirm(`Delete organization "${name}"? All members will be removed.`)) return
    await fetch(`/api/organizations/${id}`, { method: 'DELETE' })
    loadOrganizations()
  }
  async function assignUser(orgId: string, userId: string) {
    await fetch(`/api/organizations/${orgId}/members/${userId}`, { method: 'PUT' }); loadOrganizations()
  }
  async function removeUser(orgId: string, userId: string) {
    await fetch(`/api/organizations/${orgId}/members/${userId}`, { method: 'DELETE' }); loadOrganizations()
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: '0.875rem',
    fontFamily: 'var(--font-body)', border: '1px solid var(--border)', borderRadius: 7,
    outline: 'none', color: 'var(--fg)', background: 'var(--input-bg)',
  }

  const tabs = [
    { id: 'users' as const, label: 'Users', icon: <UsersIcon size={14} /> },
    { id: 'organizations' as const, label: 'Organization', icon: <UsersRound size={14} /> },
    { id: 'pins' as const, label: 'Reset Note PIN', icon: <Lock size={14} />, badge: activeTab === 'pins' ? lockedNotes.length : undefined },
    { id: 'ai-history' as const, label: 'AI History', icon: <Sparkles size={14} /> },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar activeNoteId={null} />

      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-app)', position: 'relative' }}>
        {/* Sticky Action Bar */}
        <header
          className="sticky top-0 z-30 border-b flex items-center justify-between gap-4"
          style={{
            background: 'var(--bg)',
            borderColor: 'var(--border)',
            padding: isMobile ? '12px 16px' : '16px 60px',
            paddingLeft: isMobile ? '64px' : '64px',
            minHeight: '63px',
          }}
        >
          {/* Header left title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
              Admin Panel
            </span>
          </div>

          {/* Navigation links (Tabs) */}
          <nav className="flex items-center gap-1 rounded-md p-1" style={{ background: 'var(--input-bg)' }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition hover:opacity-90"
                  style={{
                    background: isActive ? 'var(--bg)' : 'transparent',
                    color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tab.icon}
                  <span className="hidden sm:inline" style={{ marginLeft: 6 }}>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span style={{ minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px', background: isActive ? 'var(--primary)' : 'var(--border)', color: isActive ? 'var(--primary-fg)' : 'var(--fg-muted)', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Header right action */}
          {activeTab === 'users' ? (
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <UserPlus size={13} /> Add User
            </button>
          ) : <div style={{ width: 88 }} />}
        </header>

        {/* Scrollable Content Workspace */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: isMobile ? '24px 16px 40px' : '40px 60px',
            background: 'var(--bg-app)',
          }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>

           {/* ── Tab: Users ── */}
          {activeTab === 'users' && (
            <>
              {showForm && (
                <form onSubmit={handleAdd} style={{ background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>Add New User</p>
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
                    <button type="submit" disabled={adding} style={{ padding: '7px 18px', fontSize: '0.875rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: adding ? 0.7 : 1 }}>{adding ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => { setShowForm(false); setError(null) }} style={{ padding: '7px 18px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', background: 'var(--bg)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              )}


              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>User List</h2>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                    <thead>
                      <tr style={{ background: 'var(--muted)' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'left' }}>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} style={{ borderTop: '1px solid var(--border)', background: u.id === user?.userId ? 'var(--accent)' : 'transparent' }}>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 7, background: u.role === 'admin' ? 'var(--accent)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)', flexShrink: 0 }}>
                                {u.role === 'admin' ? <Shield size={14} /> : <Eye size={14} />}
                              </div>
                              <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{u.username}</span>
                              <span style={{ fontSize: '0.72rem', textTransform: 'capitalize', color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)' }}>{u.role}</span>
                              {u.id === user?.userId && <span style={{ fontSize: '0.68rem', padding: '1px 6px', background: 'var(--primary)', color: 'var(--primary-fg)', borderRadius: 20, fontWeight: 500 }}>You</span>}
                              <span style={{ flex: 1 }} />
                              <button onClick={() => handleEditUser(u.id, u.username, u.role)} title="Edit user" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleResetPassword(u.id, u.username)} title="Reset Password" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                                <KeyRound size={12} />
                              </button>
                              <button onClick={() => handleDelete(u.id, u.username)} title="Delete user" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

           {/* ── Tab: Reset Note PIN ── */}
          {activeTab === 'pins' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', margin: 0 }}>PIN-Locked Notes</h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>Delete or change any note's PIN as admin.</p>
                </div>
                <button
                  onClick={loadLockedNotes}
                  disabled={loadingLocked}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    background: 'var(--muted)',
                    color: 'var(--fg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    opacity: loadingLocked ? 0.6 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--primary)'
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 10%, var(--muted))'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--muted)'
                  }}
                >
                  <RefreshCw size={12} style={loadingLocked ? { animation: 'spin 0.8s linear infinite' } : {}} />
                  Refresh
                </button>
              </div>

              {loadingLocked ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>Loading…</div>
              ) : lockedNotes.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <LockOpen size={22} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>No locked notes</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>All notes currently do not use a PIN</p>
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                    <colgroup>
                      <col style={{ width: '100%' }} />
                      <col style={{ width: 170 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: 'var(--muted)' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'left' }}>Notes</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lockedNotes.map(note => (
                        <tr key={note.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 16px', minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {note.title || 'Untitled'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)' }}>@{note.ownerUsername}</span>
                              <span style={{ fontSize: '0.68rem', padding: '1px 7px', borderRadius: 20, fontWeight: 500, background: note.type === 'organization' ? 'var(--accent)' : 'var(--muted)', color: note.type === 'organization' ? 'var(--primary)' : 'var(--fg-subtle)' }}>
                                {note.type === 'organization' ? 'Organization' : 'Personal'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)' }}>
                                {new Date(note.updatedAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            <button onClick={() => setResetTarget(note)} title="Manage PIN" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--muted)', color: 'var(--fg-subtle)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--fg-subtle)' }}>
                              <KeyRound size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

           {/* ── Tab: Organizations ── */}
          {activeTab === 'organizations' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', margin: 0 }}>Manage Organizations</h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>Create and manage organizations and their members</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={loadOrganizations} disabled={loadingOrgs} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', opacity: loadingOrgs ? 0.6 : 1 }}>
                    <RefreshCw size={12} style={loadingOrgs ? { animation: 'spin 0.8s linear infinite' } : {}} />
                  </button>
                  <button onClick={() => setShowOrgForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                    <Plus size={14} /> Create
                  </button>
                </div>
              </div>

              {/* Create form */}
              {showOrgForm && (
                <form onSubmit={handleCreateOrg} style={{ background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <input style={inputBase} placeholder="Organization name" required value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                    <input style={inputBase} placeholder="Description (optional)" value={orgForm.description} onChange={e => setOrgForm(f => ({ ...f, description: e.target.value }))} onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" disabled={savingOrg} style={{ padding: '7px 18px', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: savingOrg ? 0.7 : 1 }}>{savingOrg ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setShowOrgForm(false)} style={{ padding: '7px 18px', fontSize: '0.8125rem', fontFamily: 'var(--font-body)', background: 'var(--bg)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              )}

              {loadingOrgs ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>Loading…</div>
              ) : organizations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>No organizations yet</div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                    <thead>
                      <tr style={{ background: 'var(--muted)' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--fg-muted)', textAlign: 'left' }}>Organization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {organizations.map(org => {
                        const members = users.filter(u => u.organizationIds?.includes(org.id))
                        const nonMembers = users.filter(u => !u.organizationIds?.includes(org.id))
                        const isExpanded = expandedOrg === org.id
                        const isEditing = editingOrg?.org?.id === org.id
                        return (
                          <tr key={org.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 16px' }}>
                              {isEditing ? (
                                <form onSubmit={handleEditOrg} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                   <input style={{ ...inputBase, flex: 1 }} placeholder="Name" required value={editOrgForm.name} onChange={e => setEditOrgForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                                   <input style={{ ...inputBase, flex: 1 }} placeholder="Description" value={editOrgForm.description} onChange={e => setEditOrgForm(f => ({ ...f, description: e.target.value }))} />
                                  <button type="submit" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--primary)' }}><Check size={13} /></button>
                                  <button type="button" onClick={() => setEditingOrg(null)} style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-muted)' }}><X size={13} /></button>
                                </form>
                              ) : (
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}><UsersRound size={14} /></div>
                                    <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{org.name}</span>
                                    {org.description && <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)' }}>{org.description}</span>}
                                    <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)' }}>{members.length} members</span>
                                    <span style={{ flex: 1 }} />
                                    <button onClick={() => setExpandedOrg(isExpanded ? null : org.id)} title="Manage Members" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: isExpanded ? 'var(--accent)' : 'transparent', color: isExpanded ? 'var(--primary)' : 'var(--fg-subtle)', border: 'none', borderRadius: 5, cursor: 'pointer' }}><UserPlus size={12} /></button>
                                    <button onClick={() => { setEditingOrg({ org }); setEditOrgForm({ name: org.name, description: org.description ?? '' }) }} title="Edit" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}><Pencil size={12} /></button>
                                    <button onClick={() => handleDeleteOrg(org.id, org.name)} title="Delete" style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}><Trash2 size={12} /></button>
                                  </div>
                                  {isExpanded && (
                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                      <div style={{ flex: 1, minWidth: 180 }}>
                                         <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members ({members.length})</p>
                                         {members.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--fg-subtle)' }}>No members yet</p>}
                                        {members.map(u => (
                                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--muted)', borderRadius: 5, marginBottom: 3 }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--fg)' }}>{u.username}</span>
                                            <span style={{ flex: 1 }} />
                                            <button onClick={() => removeUser(org.id, u.id)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}><UserMinus size={10} /></button>
                                          </div>
                                        ))}
                                      </div>
                                      {nonMembers.length > 0 && (
                                        <div style={{ flex: 1, minWidth: 180 }}>
                                           <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Members</p>
                                          {nonMembers.map(u => (
                                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--muted)', borderRadius: 5, marginBottom: 3 }}>
                                              <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)' }}>{u.username}</span>
                                              <span style={{ flex: 1 }} />
                                              <button onClick={() => assignUser(org.id, u.id)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: 'var(--fg-subtle)' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}><UserPlus size={10} /></button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
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

           {/* ── Tab: AI History ── */}
          {activeTab === 'ai-history' && (
            <div>
              {/* Stats bar */}
              {aiLogsStats && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Sessions', value: aiLogsStats.total_sessions },
                    { label: 'Messages', value: aiLogsStats.total_messages },
                    { label: 'Tools', value: aiLogsStats.total_tool_calls },
                    { label: 'Tokens', value: ((aiLogsStats.total_prompt_tokens || 0) + (aiLogsStats.total_completion_tokens || 0)).toLocaleString() },
                  ].map((s, i) => (
                    <span key={i} style={{ fontSize: '0.8rem', color: 'var(--fg-muted)' }}>
                      <strong style={{ color: 'var(--fg)' }}>{s.value}</strong> {s.label}
                    </span>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      value={aiLogFilterUser}
                      onChange={e => { setAiLogFilterUser(e.target.value); setAiLogsPage(1) }}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', fontFamily: 'var(--font-body)', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--input-bg)', color: 'var(--fg)', outline: 'none' }}
                    >
                      <option value="">All Users</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </select>
                    <button onClick={loadAiLogs} disabled={loadingAiLogs} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', opacity: loadingAiLogs ? 0.6 : 1 }}>
                      <RefreshCw size={12} style={loadingAiLogs ? { animation: 'spin 0.8s linear infinite' } : {}} />
                      Refresh
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              {loadingAiLogs ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg-muted)' }}>Loading…</div>
              ) : aiLogs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 12 }}>
                  <Sparkles size={32} style={{ color: 'var(--fg-subtle)' }} />
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--fg)' }}>No AI history yet</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-body)', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '15%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '38%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '10%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        {['User', 'Session ID', 'Note Title', 'Message JSON', 'Token Usage', 'Time'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--fg-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', background: 'var(--muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aiLogs.map(sess => {
                        const createdDate = new Date(sess.created_at)
                        const isExpanded = expandedSession === sess.session_id
                        const totalTokens = (sess.prompt_tokens || 0) + (sess.completion_tokens || 0)
                        return (
                          <tr
                            key={sess.session_id}
                            onClick={() => setExpandedSession(isExpanded ? null : sess.session_id)}
                            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isExpanded ? 'var(--accent)' : 'transparent', transition: 'background 0.1s' }}
                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--muted)' }}
                            onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                              <span style={{ fontWeight: 600, color: 'var(--fg)' }}>
                                {sess.username ? `@${sess.username}` : <span style={{ color: 'var(--fg-subtle)', fontStyle: 'italic' }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sess.session_id}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'top', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sess.note_title ? (
                                <span style={{ color: 'var(--fg)' }}>{sess.note_title}</span>
                              ) : (
                                <span style={{ color: 'var(--fg-subtle)', fontStyle: 'italic' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                              {isExpanded ? (
                                <pre style={{ margin: 0, fontSize: '0.68rem', lineHeight: 1.5, color: 'var(--fg)', background: 'var(--muted)', padding: '8px 10px', borderRadius: 6, maxHeight: 350, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                                  {JSON.stringify(sess.messages, null, 2)}
                                </pre>
                              ) : (
                                <span style={{ color: 'var(--fg-muted)', fontSize: '0.75rem' }}>
                                  {sess.messages.length} messages — click to view
                                </span>
                              )}
                              {sess.has_error && sess.error_message && (
                                <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(224,49,49,0.06)', border: '1px solid rgba(224,49,49,0.2)', borderRadius: 5, fontSize: '0.7rem', color: '#e03131' }}>
                                  {sess.error_message}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {totalTokens > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{totalTokens.toLocaleString()}</span>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>
                                    {sess.prompt_tokens.toLocaleString()} in / {sess.completion_tokens.toLocaleString()} out
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--fg-subtle)', fontSize: '0.72rem' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: '0.72rem', color: 'var(--fg-muted)' }}>
                                {createdDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--fg-subtle)' }}>
                                {createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {aiLogsTotal > 30 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => setAiLogsPage(p => Math.max(1, p - 1))}
                    disabled={aiLogsPage === 1}
                    style={{ padding: '5px 12px', fontSize: '0.8,rem', fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 6, cursor: aiLogsPage === 1 ? 'not-allowed' : 'pointer', opacity: aiLogsPage === 1 ? 0.5 : 1 }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--fg-muted)' }}>
                    {aiLogsPage} / {Math.ceil(aiLogsTotal / 30)}
                  </span>
                  <button
                    onClick={() => setAiLogsPage(p => p + 1)}
                    disabled={aiLogsPage >= Math.ceil(aiLogsTotal / 30)}
                    style={{ padding: '5px 12px', fontSize: '0.8rem', fontFamily: 'var(--font-body)', background: 'var(--muted)', color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 6, cursor: aiLogsPage >= Math.ceil(aiLogsTotal / 30) ? 'not-allowed' : 'pointer', opacity: aiLogsPage >= Math.ceil(aiLogsTotal / 30) ? 0.5 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
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

      {/* User Action Modal */}
      {userModal && (
        <UserActionModal
          user={userModal.user}
          action={userModal.action}
          onClose={() => setUserModal(null)}
          onDone={() => { setUserModal(null); showToast(userModal.action === 'delete' ? 'User deleted' : userModal.action === 'password' ? 'Password changed' : 'User updated'); router.invalidate() }}
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
