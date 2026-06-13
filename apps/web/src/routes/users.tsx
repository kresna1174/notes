import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { useState, useEffect } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Trash2, UserPlus, Shield, Eye } from 'lucide-react'

export const Route = createFileRoute('/users')({
  component: UsersPage,
})

interface User { id: string; username: string; role: 'admin' | 'viewer'; status: 'approved' | 'rejected' | 'pending'; createdAt: number }

function UsersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' as 'admin' | 'viewer' })
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate({ to: '/' }); return }
    load()
  }, [user])

  async function load() {
    const res = await fetch('/api/auth/users')
    if (res.ok) setUsers(await res.json())
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setAdding(false)
    if (!res.ok) { setError(data.error); return }
    setForm({ username: '', password: '', role: 'viewer' })
    setShowForm(false)
    load()
  }

  async function handleApprove(id: string) {
    await fetch(`/api/auth/users/${id}/approve`, { method: 'PUT' })
    load()
  }

  async function handleReject(id: string) {
    await fetch(`/api/auth/users/${id}/reject`, { method: 'PUT' })
    load()
  }

  async function handleDelete(id: string, username: string) {
    if (!window.confirm(`Hapus user "${username}"?`)) return
    await fetch(`/api/auth/users/${id}`, { method: 'DELETE' })
    load()
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 12px', fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--border)', borderRadius: 7,
    outline: 'none', color: 'var(--fg)', background: 'var(--input-bg)',
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px', maxWidth: 640 }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 8, marginBottom: 28 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>
                User Management
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Kelola akses pengguna
              </p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', fontSize: '0.875rem', fontWeight: 500,
                fontFamily: 'var(--font-body)',
                background: 'var(--primary)', color: 'var(--primary-fg)',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              <UserPlus size={15} /> Tambah User
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAdd} style={{
              background: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '20px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>Tambah User Baru</p>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <input
                  style={inputBase} placeholder="Username" required
                  value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <input
                  style={inputBase} placeholder="Password" type="password" required
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['viewer', 'admin'] as const).map(r => (
                  <button
                    key={r} type="button"
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', fontSize: '0.8125rem', borderRadius: 6,
                      border: '1px solid', cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      background: form.role === r ? 'var(--accent)' : 'var(--bg)',
                      borderColor: form.role === r ? 'var(--primary)' : 'var(--border)',
                      color: form.role === r ? 'var(--primary)' : 'var(--fg-muted)',
                      fontWeight: form.role === r ? 600 : 400,
                    }}
                  >
                    {r === 'admin' ? <Shield size={12} /> : <Eye size={12} />}
                    {r === 'admin' ? 'Admin' : 'Viewer'}
                  </button>
                ))}
              </div>
              {error && <p style={{ margin: 0, fontSize: '0.8125rem', color: '#e03131' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="submit" disabled={adding}
                  style={{
                    padding: '7px 18px', fontSize: '0.875rem', fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    background: 'var(--primary)', color: 'var(--primary-fg)',
                    border: 'none', borderRadius: 7, cursor: 'pointer',
                    opacity: adding ? 0.7 : 1,
                  }}
                >
                  {adding ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button
                  type="button" onClick={() => { setShowForm(false); setError(null) }}
                  style={{
                    padding: '7px 18px', fontSize: '0.875rem',
                    fontFamily: 'var(--font-body)',
                    background: 'var(--bg)', color: 'var(--fg-muted)',
                    border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          {/* Pending Approval Section */}
          {users.some(u => u.status === 'pending') && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
                Permintaan Pendaftaran (Pending Approval)
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.filter(u => u.status === 'pending').map(u => (
                  <div key={u.id} style={{
                    display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
                    padding: '12px 16px', gap: isMobile ? 12 : 8,
                    border: '1px solid var(--border)', borderRadius: 10,
                    background: 'var(--card-bg)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--fg-subtle)',
                        flexShrink: 0,
                      }}>
                        <Eye size={16} />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>
                          {u.username}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 2 }}>
                          Mendaftar pada {new Date(u.createdAt).toLocaleDateString('id-ID')}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                      <button
                        onClick={() => handleApprove(u.id)}
                        style={{
                          padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                          background: 'var(--primary)', color: 'var(--primary-fg)',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Setujui
                      </button>
                      <button
                        onClick={() => handleReject(u.id)}
                        style={{
                          padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                          background: 'rgba(224,49,49,0.05)', color: '#e03131',
                          border: '1px solid rgba(224,49,49,0.3)', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.12)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.05)')}
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Users Section */}
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '1.1rem', color: 'var(--fg)', marginBottom: 12 }}>
              Daftar Pengguna
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.filter(u => u.status !== 'pending').map(u => (
                <div key={u.id} style={{
                  display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
                  padding: '12px 16px', gap: isMobile ? 12 : 8,
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: u.id === user?.userId ? 'var(--accent)' : 'var(--card-bg)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: u.role === 'admin' ? 'var(--accent)' : 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)',
                      flexShrink: 0,
                    }}>
                      {u.role === 'admin' ? <Shield size={16} /> : <Eye size={16} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>
                          {u.username}
                        </span>
                        {u.status === 'rejected' && (
                          <span style={{
                            fontSize: '0.7rem', padding: '1px 7px',
                            background: 'rgba(224,49,49,0.1)', color: '#e03131',
                            borderRadius: 20, fontWeight: 500,
                          }}>
                            Ditolak
                          </span>
                        )}
                        {u.id === user?.userId && (
                          <span style={{
                            fontSize: '0.7rem', padding: '1px 7px',
                            background: 'var(--primary)', color: 'var(--primary-fg)',
                            borderRadius: 20, fontWeight: 500,
                          }}>
                            Kamu
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 500, textTransform: 'capitalize',
                        color: u.role === 'admin' ? 'var(--primary)' : 'var(--fg-subtle)',
                      }}>
                        {u.role}
                      </span>
                    </div>
                  </div>
                  {u.id !== user?.userId && (
                    <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                      {u.status === 'rejected' && (
                        <button
                          onClick={() => handleApprove(u.id)}
                          style={{
                            padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
                            background: 'transparent', color: 'var(--primary)',
                            border: '1.5px solid var(--primary)', borderRadius: 6, cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          Aktifkan
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(u.id, u.username)}
                        style={{
                          width: 32, height: 32,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none',
                          borderRadius: 6, cursor: 'pointer', color: 'var(--fg-subtle)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
