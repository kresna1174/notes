import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { useState, useEffect } from 'react'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Trash2, Plus, UsersRound, UserMinus, UserPlus, Pencil, Check, X } from 'lucide-react'

export const Route = createFileRoute('/teams')({
  component: TeamsPage,
})

interface Team { id: string; name: string; description: string | null; createdAt: number }
interface User { id: string; username: string; role: string; teamId: string | null }

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 12px', fontSize: '0.875rem',
  fontFamily: 'var(--font-body)',
  border: '1px solid var(--border)', borderRadius: 7,
  outline: 'none', color: 'var(--fg)', background: 'var(--input-bg)',
}

function TeamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate({ to: '/' }); return }
    load()
  }, [user])

  async function load() {
    const [tr, ur] = await Promise.all([
      fetch('/api/teams').then(r => r.json()),
      fetch('/api/auth/users').then(r => r.json()),
    ])
    setTeams(Array.isArray(tr) ? tr : [])
    setUsers(Array.isArray(ur) ? ur : [])
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setForm({ name: '', description: '' })
    setShowForm(false)
    load()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTeam) return
    setSaving(true)
    await fetch(`/api/teams/${editingTeam.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    setEditingTeam(null)
    load()
  }

  async function handleDeleteTeam(id: string, name: string) {
    if (!window.confirm(`Hapus tim "${name}"? Semua member akan dikeluarkan dari tim.`)) return
    await fetch(`/api/teams/${id}`, { method: 'DELETE' })
    load()
  }

  async function assignUser(teamId: string, userId: string) {
    await fetch(`/api/teams/${teamId}/members/${userId}`, { method: 'PUT' })
    load()
  }

  async function removeUser(teamId: string, userId: string) {
    await fetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div style={{ padding: '40px 40px', maxWidth: 720 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--fg)', margin: 0 }}>
                Kelola Tim
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Buat tim dan assign anggota
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
              <Plus size={15} /> Buat Tim
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form onSubmit={handleCreate} style={{
              background: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '20px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>Tim Baru</p>
              <input
                style={inputBase} placeholder="Nama tim" required
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

          {/* Teams list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {teams.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>
                Belum ada tim. Buat tim pertama.
              </div>
            )}
            {teams.map(team => {
              const members = users.filter(u => u.teamId === team.id)
              const nonMembers = users.filter(u => u.teamId !== team.id)
              const isExpanded = expandedTeam === team.id
              const isEditing = editingTeam?.id === team.id

              return (
                <div key={team.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg)', overflow: 'hidden' }}>
                  {/* Team header */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UsersRound size={18} color="var(--primary)" />
                    </div>

                    {isEditing ? (
                      <form onSubmit={handleEdit} style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ ...inputBase, flex: 1 }} placeholder="Nama tim" required
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
                        <button type="button" onClick={() => setEditingTeam(null)} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)' }}>
                          <X size={16} />
                        </button>
                      </form>
                    ) : (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--fg)', fontFamily: 'var(--font-body)' }}>{team.name}</div>
                        {team.description && <div style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', marginTop: 2 }}>{team.description}</div>}
                        <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 2 }}>{members.length} anggota</div>
                      </div>
                    )}

                    {!isEditing && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => { setExpandedTeam(isExpanded ? null : team.id) }}
                          style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: isExpanded ? 'var(--accent)' : 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: isExpanded ? 'var(--primary)' : 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}
                        >
                          <UserPlus size={12} /> Kelola Anggota
                        </button>
                        <button
                          onClick={() => { setEditingTeam(team); setEditForm({ name: team.name, description: team.description ?? '' }) }}
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--fg-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id, team.name)}
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
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', display: 'flex', gap: 16 }}>
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
                                onClick={() => removeUser(team.id, u.id)}
                                title="Keluarkan dari tim"
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
                                  onClick={() => assignUser(team.id, u.id)}
                                  title="Tambahkan ke tim"
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
