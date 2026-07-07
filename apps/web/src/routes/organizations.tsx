import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { useState, useEffect } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Trash2, Plus, UsersRound, UserMinus, UserPlus, Pencil, Check, X } from 'lucide-react'

interface Organization { id: string; name: string; description: string | null; createdAt: number }
interface User { id: string; username: string; role: string; organizationIds: string[] }

export const Route = createFileRoute('/organizations')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user || context.auth.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  loader: async () => {
    const [or, ur] = await Promise.all([
      fetch('/api/organizations').then(r => r.json()),
      fetch('/api/auth/users').then(r => r.json()),
    ])
    return {
      organizations: (Array.isArray(or) ? or : []) as Organization[],
      users: (Array.isArray(ur) ? ur : []) as User[],
    }
  },
  component: OrganizationsPage,
})

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 12px', fontSize: '0.875rem',
  fontFamily: 'var(--font-body)',
  border: '1px solid var(--border)', borderRadius: 7,
  outline: 'none', color: 'var(--fg)', background: 'var(--input-bg)',
}

function OrganizationsPage() {
  const router = useRouter()
  const { organizations, users } = Route.useLoaderData()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setForm({ name: '', description: '' })
    setShowForm(false)
    router.invalidate()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingOrg) return
    setSaving(true)
    await fetch(`/api/organizations/${editingOrg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    setEditingOrg(null)
    router.invalidate()
  }

  async function handleDeleteOrg(id: string, name: string) {
    if (!window.confirm(`Hapus organisasi "${name}"? Semua member akan dikeluarkan dari organisasi.`)) return
    await fetch(`/api/organizations/${id}`, { method: 'DELETE' })
    router.invalidate()
  }

  async function assignUser(orgId: string, userId: string) {
    await fetch(`/api/organizations/${orgId}/members/${userId}`, { method: 'PUT' })
    router.invalidate()
  }

  async function removeUser(orgId: string, userId: string) {
    await fetch(`/api/organizations/${orgId}/members/${userId}`, { method: 'DELETE' })
    router.invalidate()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: isMobile ? '64px 16px 24px' : '40px 40px', maxWidth: 720 }}>

          {/* Header */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 8, marginBottom: 28 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>
                Kelola Organisasi
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Buat organisasi dan assign anggota
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
              <Plus size={15} /> Buat Organisasi
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form onSubmit={handleCreate} style={{
              background: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '20px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>Organisasi Baru</p>
              <input
                style={inputBase} placeholder="Nama organisasi" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <input
                style={inputBase} placeholder="Deskripsi (opsional)"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={saving} style={{
                  padding: '7px 18px', fontSize: '0.875rem', fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                  background: 'var(--primary)', color: 'var(--primary-fg)',
                  border: 'none', borderRadius: 7, cursor: 'pointer', opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  padding: '7px 18px', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
                  background: 'var(--bg)', color: 'var(--fg-muted)',
                  border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
                }}>
                  Batal
                </button>
              </div>
            </form>
          )}

          {/* Organizations list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {organizations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                Belum ada organisasi. Buat organisasi pertama.
              </div>
            )}
            {organizations.map(org => {
              const members = users.filter(u => u.organizationIds?.includes(org.id))
              const nonMembers = users.filter(u => !u.organizationIds?.includes(org.id))
              const isExpanded = expandedOrg === org.id
              const isEditing = editingOrg?.id === org.id

              return (
                <div key={org.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg)', overflow: 'hidden' }}>
                  {/* Org header */}
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <UsersRound size={18} color="var(--primary)" />
                      </div>

                      {isEditing ? (
                        <form onSubmit={handleEdit} style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            style={{ ...inputBase, flex: 1 }} placeholder="Nama organisasi" required
                            value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                            autoFocus
                          />
                          <input
                            style={{ ...inputBase, flex: 1 }} placeholder="Deskripsi"
                            value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          />
                          <button type="submit" style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}>
                            <Check size={16} />
                          </button>
                          <button type="button" onClick={() => setEditingOrg(null)} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
                            <X size={16} />
                          </button>
                        </form>
                      ) : (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>{org.name}</div>
                          {org.description && <div style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', marginTop: 2 }}>{org.description}</div>}
                          <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 2 }}>{members.length} anggota</div>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, justifyContent: isMobile ? 'flex-end' : 'flex-start', marginTop: isMobile ? 8 : 0 }}>
                        <button
                          onClick={() => { setExpandedOrg(isExpanded ? null : org.id) }}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: isExpanded ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: isExpanded ? 'var(--primary)' : 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}
                        >
                          <UserPlus size={12} /> Kelola Anggota
                        </button>
                        <button
                          onClick={() => { setEditingOrg(org); setEditForm({ name: org.name, description: org.description ?? '' }) }}
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--fg-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(org.id, org.name)}
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--fg-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Members panel */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                      {/* Current members */}
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Anggota ({members.length})
                        </p>
                        {members.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>Belum ada anggota</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {members.map(u => (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--muted)', borderRadius: 7 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>{u.username}</span>
                              <button
                                onClick={() => removeUser(org.id, u.id)}
                                title="Keluarkan dari organisasi"
                                style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}
                              >
                                <UserMinus size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Add members */}
                      {nonMembers.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Tambah Anggota
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {nonMembers.map(u => (
                              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--muted)', borderRadius: 7 }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>{u.username}</span>
                                <button
                                  onClick={() => assignUser(org.id, u.id)}
                                  title="Tambahkan ke organisasi"
                                  style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', color: 'var(--fg-subtle)' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-subtle)' }}
                                >
                                  <UserPlus size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
