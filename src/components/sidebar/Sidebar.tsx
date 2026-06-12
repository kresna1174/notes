import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScrollArea } from '../ui/scroll-area'
import { DayGroup } from './DayGroup'
import { SearchBar } from './SearchBar'
import { Plus, LogOut, Users, Shield, Eye, UsersRound } from 'lucide-react'
import { FontPicker } from './FontPicker'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../../lib/auth'

interface Note { id: string; title: string; createdAt: number }
interface SearchResult { id: string; title: string; createdAt: number; snippet: string }
interface SidebarProps {
  activeNoteId: string | null
  onShareNote?: (id: string) => void
}

function getDayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupByDay(notes: Note[]) {
  const map = new Map<string, Note[]>()
  for (const note of notes) {
    const label = getDayLabel(note.createdAt)
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(note)
  }
  return Array.from(map.entries()).map(([label, notes]) => ({ label, notes }))
}

export function Sidebar({ activeNoteId, onShareNote }: SidebarProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [teamNotes, setTeamNotes] = useState<Note[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [teamName, setTeamName] = useState<string | null>(null)
  const [width, setWidth] = useState(308)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.max(180, Math.min(480, startW.current + delta)))
    }
    function onUp() { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  async function loadNotes() {
    const res = await fetch('/api/notes?scope=mine')
    if (!res.ok) return
    const data = await res.json()
    setNotes(Array.isArray(data) ? data : [])
  }

  async function loadTeamNotes() {
    if (!user?.teamId) return
    const res = await fetch('/api/notes?scope=team')
    if (!res.ok) return
    const data = await res.json()
    setTeamNotes(Array.isArray(data) ? data : [])
    // fetch team name
    fetch('/api/teams').then(r => r.json()).then((ts: any[]) => {
      const t = ts.find(t => t.id === user.teamId)
      if (t) setTeamName(t.name)
    })
  }

  useEffect(() => {
    loadNotes()
    loadTeamNotes()
  }, [activeNoteId, user?.teamId])

  // auto-switch tab based on active note
  useEffect(() => {
    if (!activeNoteId || !user?.teamId) return
    const isTeamNote = teamNotes.some(n => n.id === activeNoteId)
    const isMineNote = notes.some(n => n.id === activeNoteId)
    if (isTeamNote && !isMineNote) setActiveTab('team')
    else if (isMineNote) setActiveTab('mine')
  }, [activeNoteId, notes, teamNotes])

  async function renameNote(id: string, title: string) {
    await fetch(`/api/notes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
    await loadNotes()
  }

  async function deleteNote(id: string) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    if (activeNoteId === id) {
      if (activeTab === 'team') {
        const remainingTeam = teamNotes.filter(n => n.id !== id)
        navigate({ to: remainingTeam.length > 0 ? '/notes/$id' : '/', params: remainingTeam.length > 0 ? { id: remainingTeam[0].id } : {} })
      } else {
        const remainingMine = notes.filter(n => n.id !== id)
        navigate({ to: remainingMine.length > 0 ? '/notes/$id' : '/', params: remainingMine.length > 0 ? { id: remainingMine[0].id } : {} })
      }
    }
    await loadNotes()
    await loadTeamNotes()
  }

  const [activeTab, setActiveTab] = useState<'mine' | 'team'>('mine')
  const newBtnRef = useRef<HTMLButtonElement>(null)

  async function createNote() {
    const type = activeTab === 'team' ? 'team' : 'individual'
    const teamId = activeTab === 'team' ? (user?.teamId ?? null) : null
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, type }),
    })
    if (!res.ok) return
    const note = await res.json()
    if (!note?.id) return
    await loadNotes()
    if (teamId) await loadTeamNotes()
    navigate({ to: '/notes/$id', params: { id: note.id } })
  }

  const groups = groupByDay(notes)
  const teamGroups = groupByDay(teamNotes.filter(n => !notes.find(m => m.id === n.id)))

  const C = {
    fg: 'var(--fg)', fgMuted: 'var(--fg-muted)', fgSubtle: 'var(--fg-subtle)',
    primary: 'var(--primary)', accent: 'var(--accent)', border: 'var(--border)',
    muted: 'var(--muted)',
  }

  return (
    <div className="shrink-0 flex flex-col h-screen" style={{ width, background: 'var(--sidebar-bg)', borderRight: `1px solid ${C.border}`, position: 'relative' }}>
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo192.png" alt="Homebrew Notes Logo" className="w-6 h-6 object-contain" />
          <span className="text-sm font-semibold" style={{ color: C.fg, letterSpacing: '-0.01em' }}>Homebrew Notes</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <FontPicker />
          <button
            ref={newBtnRef}
            onClick={createNote}
            title={activeTab === 'team' ? 'Catatan Tim Baru' : 'Catatan Baru'}
            className="flex items-center justify-center w-7 h-7 rounded-md"
            style={{ color: C.primary, background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = C.accent)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SearchBar onResults={setSearchResults} />

      {/* Tab switcher — only show when user has a team */}
      {user?.teamId && (
        <div style={{ display: 'flex', margin: '0 10px 4px', gap: 4, background: C.muted, borderRadius: 8, padding: 3 }}>
          {([['mine', 'Saya'], ['team', teamName ?? 'Tim']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '5px 0', fontSize: '0.75rem', fontWeight: activeTab === tab ? 600 : 400,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: activeTab === tab ? 'var(--bg)' : 'transparent',
                color: activeTab === tab ? C.fg : C.fgMuted,
                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {tab === 'team' && <UsersRound size={11} />}
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ height: '1px', background: C.border, margin: '4px 0' }} />

      <ScrollArea className="flex-1">
        {searchResults ? (
          <div className="py-1 px-2">
            <p className="px-2 py-1 text-xs font-medium" style={{ color: C.fgMuted }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
            {searchResults.map(r => (
              <button
                key={r.id}
                onClick={() => navigate({ to: '/notes/$id', params: { id: r.id } })}
                className="flex flex-col w-full px-3 py-2 text-left rounded-lg mb-0.5"
                style={{ color: C.fg, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accent)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-sm font-medium truncate">{r.title || 'Untitled'}</span>
                <span className="text-xs line-clamp-2 mt-0.5" style={{ color: C.fgMuted }}
                  dangerouslySetInnerHTML={{ __html: r.snippet }} />
              </button>
            ))}
          </div>
        ) : activeTab === 'mine' ? (
          <div className="py-1 px-2">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: C.accent, color: C.primary }}>
                  <Plus className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium mb-3" style={{ color: C.fg }}>Belum ada catatan</p>
                <button
                  onClick={createNote}
                  className="text-xs font-semibold py-2 px-4 rounded-lg transition-all"
                  style={{
                    background: C.primary,
                    color: 'var(--primary-fg)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Buat Catatan Baru
                </button>
              </div>
            ) : (
              groups.map(g => (
                <DayGroup key={g.label} label={g.label} notes={g.notes}
                  activeNoteId={activeNoteId}
                  onSelect={id => navigate({ to: '/notes/$id', params: { id } })}
                  onRename={renameNote}
                  onDelete={deleteNote}
                  onShare={onShareNote}
                />
              ))
            )}
          </div>
        ) : (
          <div className="py-1 px-2">
            {teamNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: C.accent, color: C.primary }}>
                  <Plus className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium mb-3" style={{ color: C.fg }}>Belum ada catatan tim</p>
                <button
                  onClick={createNote}
                  className="text-xs font-semibold py-2 px-4 rounded-lg transition-all"
                  style={{
                    background: C.primary,
                    color: 'var(--primary-fg)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Buat Catatan Tim Baru
                </button>
              </div>
            ) : (
              teamGroups.map(g => (
                <DayGroup key={'team-' + g.label} label={g.label} notes={g.notes}
                  activeNoteId={activeNoteId}
                  onSelect={id => navigate({ to: '/notes/$id', params: { id } })}
                  onRename={renameNote}
                  onDelete={deleteNote}
                  onShare={onShareNote}
                />
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', flexShrink: 0 }}>
        {user?.role === 'admin' && (
          <>
          <button
            onClick={() => navigate({ to: '/teams' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 2,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <UsersRound size={14} /> Kelola Tim
          </button>
          <button
            onClick={() => navigate({ to: '/users' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '7px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 4,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <Users size={14} /> Kelola User
          </button>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: user?.role === 'admin' ? C.accent : C.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: user?.role === 'admin' ? C.primary : C.fgMuted,
            }}>
              {user?.role === 'admin' ? <Shield size={13} /> : <Eye size={13} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </div>
              <div style={{ fontSize: '0.7rem', color: C.fgSubtle, textTransform: 'capitalize' }}>
                {user?.role}{teamName ? ` · ${teamName}` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={async () => { await logout(); navigate({ to: '/login' }) }}
            title="Logout"
            style={{
              width: 28, height: 28, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 6,
              cursor: 'pointer', color: C.fgSubtle,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,49,49,0.1)'; e.currentTarget.style.color = '#e03131' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgSubtle }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* resize handle */}
      <div
        style={{
          position: 'absolute', top: 0, right: -3, bottom: 0, width: 6,
          cursor: 'col-resize', zIndex: 10,
        }}
        onMouseDown={e => {
          e.preventDefault()
          dragging.current = true
          startX.current = e.clientX
          startW.current = width
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      />
    </div>
  )
}
