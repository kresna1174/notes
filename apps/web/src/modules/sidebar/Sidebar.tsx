import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScrollArea } from '../shared/ui'
import { NoteTree } from './NoteTree'
import { SearchBar } from './SearchBar'
import { Plus, LogOut, Users, Shield, Eye, Info, Menu, X, KeyRound, Brain, ChevronDown, Check, FileStack, Settings } from 'lucide-react'
import { FontPicker } from './FontPicker'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../shared/auth'
import { useIsDesktop } from '../shared'
import { AboutModal } from '../auth'
import { ChangePasswordModal } from '../auth'

interface Note { id: string; title: string; createdAt: number; parentId?: string | null; shareToken?: string | null; icon?: string | null }
interface SearchResult { id: string; title: string; createdAt: number; snippet: string }
interface SidebarProps {
  activeNoteId: string | null
  onShareNote?: (id: string) => void
  notesUpdateTrigger?: number
}

export function Sidebar({ activeNoteId, onShareNote, notesUpdateTrigger }: SidebarProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [activeScope, setActiveScope] = useState<string>('personal')
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false)
  const scopeDropdownRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(308)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [showAbout, setShowAbout] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)


  // Mobile states
  const isMobile = !useIsDesktop()
  const [isOpen, setIsOpen] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target as Node)) {
        setScopeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function navigateAndClose(opts: { to: string; params?: any; search?: any }) {
    navigate(opts as any)
    if (window.innerWidth < 768) {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || isMobile) return
      const delta = e.clientX - startX.current
      setWidth(Math.max(180, Math.min(480, startW.current + delta)))
    }
    function onUp() { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isMobile])

  async function loadNotes() {
    let url = '/api/notes?scope=mine'
    if (activeScope !== 'personal') {
      url = `/api/notes?scope=organization&organizationId=${activeScope}`
    }
    const res = await fetch(url)
    if (!res.ok) return
    const data = await res.json()
    setNotes(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    loadNotes()
  }, [activeScope, notesUpdateTrigger])

  // Auto-switch sidebar scope based on the active note loaded
  useEffect(() => {
    if (!activeNoteId) return
    fetch(`/api/notes/${activeNoteId}`)
      .then(r => {
        if (r.ok) return r.json()
        return null
      })
      .then(note => {
        if (!note) return
        if (note.type === 'organization' && note.organizationId) {
          setActiveScope(note.organizationId)
        } else {
          setActiveScope('personal')
        }
      })
      .catch(err => console.error(err))
  }, [activeNoteId])

  async function renameNote(id: string, title: string) {
    await fetch(`/api/notes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
    await loadNotes()
  }

  async function deleteNote(id: string) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    if (activeNoteId === id) {
      const remaining = notes.filter(n => n.id !== id)
      navigateAndClose({ to: remaining.length > 0 ? '/notes/$id' : '/', params: remaining.length > 0 ? { id: remaining[0].id } : {} })
    }
    await loadNotes()
  }

  async function createNote() {
    const type = activeScope === 'personal' ? 'individual' : 'organization'
    const organizationId = activeScope === 'personal' ? null : activeScope
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, type }),
    })
    if (!res.ok) return
    const note = await res.json()
    if (!note?.id) return
    await loadNotes()
    navigateAndClose({ to: '/notes/$id', params: { id: note.id } })
  }

  async function createChildNote(parentId: string) {
    const type = activeScope === 'personal' ? 'individual' : 'organization'
    const organizationId = activeScope === 'personal' ? null : activeScope
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, type, parentId }),
    })
    if (!res.ok) return
    const note = await res.json()
    if (!note?.id) return
    await loadNotes()
    navigateAndClose({ to: '/notes/$id', params: { id: note.id } })
  }

  const C = {
    fg: 'var(--fg)', fgMuted: 'var(--fg-muted)', fgSubtle: 'var(--fg-subtle)',
    primary: 'var(--primary)', accent: 'var(--accent)', border: 'var(--border)',
    muted: 'var(--muted)',
  }

  const currentOrgName = activeScope === 'personal' ? '' : (user?.organizations?.find(o => o.id === activeScope)?.name || 'Organisasi')

  return (
    <>
      {isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Show sidebar"
          aria-expanded={isOpen}
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--bg)',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
        >
          <Menu size={16} />
        </button>
      )}

      {isMobile && (
        <div
          onClick={() => setIsOpen(false)}
          onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false) }}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(3px)',
            zIndex: 48,
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      <div
        className="shrink-0 flex flex-col h-screen"
        style={{
          width: isMobile ? 280 : width,
          background: 'var(--sidebar-bg)',
          borderRight: `1px solid ${C.border}`,
          position: isMobile ? 'fixed' : 'relative',
          top: isMobile ? 0 : undefined,
          bottom: isMobile ? 0 : undefined,
          left: isMobile ? 0 : undefined,
          zIndex: isMobile ? 49 : undefined,
          transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : undefined,
          transition: isMobile ? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
        }}
      >
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
              <Brain size={14} />
            </div>
            <span className="text-sm font-semibold" style={{ color: C.fg, letterSpacing: '-0.01em', fontFamily: 'var(--font-heading)' }}>Mindspace</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <FontPicker />
            {isMobile && (
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Hide sidebar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: C.fgMuted,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <SearchBar />

        {/* Scope switcher — custom themed dropdown */}
        {user?.organizations && user.organizations.length > 0 && (() => {
          const workspaceOptions = [
            { value: 'personal', label: 'Personal Notes', sublabel: 'Me' },
            ...user.organizations.map(org => ({ value: org.id, label: org.name, sublabel: 'Organization' }))
          ]
          const selected = workspaceOptions.find(o => o.value === activeScope) || workspaceOptions[0]
          return (
            <div ref={scopeDropdownRef} style={{ margin: '0 10px 8px', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: C.fgMuted, textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: 2, marginBottom: 4 }}>
                Workspace
              </label>
              {/* Trigger button */}
              <button
                onClick={() => setScopeDropdownOpen(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={scopeDropdownOpen}
                aria-label={`Workspace: ${selected.label}`}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '7px 10px',
                  fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-body)',
                  border: `1px solid ${scopeDropdownOpen ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 8, outline: 'none',
                  color: 'var(--fg)', background: 'var(--sidebar-bg)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', fontWeight: 400 }}>{selected.sublabel}</span>
                  <span style={{ fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{selected.label}</span>
                </div>
                <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--fg-muted)', transform: scopeDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {/* Dropdown panel */}
              {scopeDropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Workspace"
                  style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 10, zIndex: 100, overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    padding: '4px',
                  }}>
                  {workspaceOptions.map(opt => (
                    <button
                      key={opt.value}
                      role="option"
                      aria-selected={activeScope === opt.value}
                      onClick={() => { setActiveScope(opt.value); setSearchResults(null); setScopeDropdownOpen(false) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', border: 'none', borderRadius: 7,
                        background: activeScope === opt.value ? 'var(--accent)' : 'transparent',
                        color: activeScope === opt.value ? 'var(--primary)' : 'var(--fg)',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'var(--font-body)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (activeScope !== opt.value) e.currentTarget.style.background = 'var(--muted)' }}
                      onMouseLeave={e => { if (activeScope !== opt.value) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.7rem', color: activeScope === opt.value ? 'var(--primary)' : 'var(--fg-muted)', fontWeight: 400, opacity: 0.8 }}>{opt.sublabel}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{opt.label}</span>
                      </div>
                      {activeScope === opt.value && <Check size={13} style={{ flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* New Add Button */}
        <div style={{ padding: '0 10px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            onClick={createNote}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 0',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: 7,
              border: 'none',
              background: C.primary,
              color: 'var(--primary-fg)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={13} strokeWidth={2.5} />
            {activeScope !== 'personal' ? `New Note in ${currentOrgName}` : 'New Note'}
          </button>
        </div>

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
                  onClick={() => navigateAndClose({ to: '/notes/$id', params: { id: r.id } })}
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
          ) : (
            <div className="py-1 px-2">
              {notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: C.accent, color: C.primary }}>
                    <Plus className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-medium mb-3" style={{ color: C.fg }}>No notes yet</p>
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
                    Create New Note
                  </button>
                </div>
              ) : (
                <NoteTree
                  notes={notes}
                  activeNoteId={activeNoteId}
                  onSelect={id => navigateAndClose({ to: '/notes/$id', params: { id } })}
                  onRename={renameNote}
                  onDelete={deleteNote}
                  onCreateChild={createChildNote}
                  onShare={onShareNote}
                />
              )}


            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', flexShrink: 0 }}>
          {user?.role === 'admin' && (
            <button
              onClick={() => navigateAndClose({ to: '/users' })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 10px', borderRadius: 7, border: 'none',
                background: 'transparent', cursor: 'pointer', marginBottom: 4,
                fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
            >
              <Users size={14} /> Settings
            </button>
          )}

          {/* Wiki menu hidden — feature on hold */}

          <button
            onClick={() => navigateAndClose({ to: '/connect-account' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 2,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <Settings size={14} /> Connect Account
          </button>

          <button
            onClick={() => navigateAndClose({ to: '/documents' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 2,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <FileStack size={14} /> RAG Documents
          </button>

          <button
            onClick={() => setShowChangePassword(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 2,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <KeyRound size={14} /> Change Password
          </button>
          <button
            onClick={() => setShowAbout(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 10px', borderRadius: 7, border: 'none',
              background: 'transparent', cursor: 'pointer', marginBottom: 2,
              fontSize: '0.8125rem', color: C.fgMuted, fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = C.primary }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fgMuted }}
          >
            <Info size={14} /> Info & Changelog
          </button>
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
                  {user?.role}{user?.organizations && user.organizations.length > 0 ? ` · ${user.organizations.length} Org` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={async () => { await logout(); navigateAndClose({ to: '/login' }) }}
              aria-label="Logout"
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
        {!isMobile && (
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
        )}
        <AboutModal open={showAbout} onOpenChange={setShowAbout} />
        <ChangePasswordModal open={showChangePassword} onOpenChange={setShowChangePassword} />
      </div>
    </>
  )
}
