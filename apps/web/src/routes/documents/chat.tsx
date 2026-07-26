import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { ChatBot } from '#/modules/chat'
import { RagLayout, RagDocPanel, ConfirmDialog } from '#/modules/shared/ui'
import { Plus, MessageSquare, Trash2, Pencil, ChevronDown, Check } from 'lucide-react'

type ChatSearch = {
  session?: string
}

export const Route = createFileRoute('/documents/chat')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => {
    return {
      session: typeof search.session === 'string' ? search.session : undefined
    }
  },
  component: RagChatPage,
})

interface NoteTreeNode {
  id: string
  title: string
  parentId: string | null
  createdAt: number
  children: NoteTreeNode[]
}

// Tree builder helper for notes list
function buildNoteTree(notes: any[]): NoteTreeNode[] {
  const map = new Map<string, NoteTreeNode>()
  const roots: NoteTreeNode[] = []

  // Initialize
  for (const note of notes) {
    map.set(note.id, { ...note, children: [] })
  }

  // Build relations
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort by createdAt desc
  const sortFn = (a: NoteTreeNode, b: NoteTreeNode) => b.createdAt - a.createdAt
  roots.sort(sortFn)
  for (const node of map.values()) {
    node.children.sort(sortFn)
  }

  return roots
}

function RagChatPage() {
  const { session } = Route.useSearch()
  const navigate = useNavigate()
  const [pinnedDocs, setPinnedDocs] = useState<{ id: string; name: string }[]>([])
  
  // Chat sessions state
  const [chatSessionsList, setChatSessionsList] = useState<any[]>([])
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editChatValue, setEditChatValue] = useState('')
  const [hoverChatId, setHoverChatId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  
  // Notes list state for selector
  const [notesList, setNotesList] = useState<any[]>([])
  
  // Custom dropdown states
  const [noteDropdownOpen, setNoteDropdownOpen] = useState(false)
  const noteDropdownRef = useRef<HTMLDivElement>(null)

  const loadChatSessions = async () => {
    const res = await fetch('/api/chat-sessions')
    if (res.ok) {
      const data = await res.json()
      setChatSessionsList(data)
    }
  }

  const loadNotes = async () => {
    const res = await fetch('/api/notes?scope=mine')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        setNotesList(data)
      }
    }
  }

  useEffect(() => {
    loadChatSessions()
    loadNotes()
  }, [session])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (noteDropdownRef.current && !noteDropdownRef.current.contains(e.target as Node)) {
        setNoteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!session) {
      // Fetch user's chat sessions, default to latest one, or create one if none exist
      fetch('/api/chat-sessions')
        .then(res => res.json())
        .then(async (sessions) => {
          if (sessions && sessions.length > 0) {
            navigate({ to: '/documents/chat', search: { session: sessions[0].id } })
          } else {
            const createRes = await fetch('/api/chat-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: 'Chat Baru' })
            })
            if (createRes.ok) {
              const newSess = await createRes.json()
              navigate({ to: '/documents/chat', search: { session: newSess.id } })
            }
          }
        })
        .catch(console.error)
    }
  }, [session, navigate])

  const createChatSession = async () => {
    const res = await fetch('/api/chat-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Chat Baru' })
    })
    if (res.ok) {
      const newSess = await res.json()
      await loadChatSessions()
      navigate({ to: '/documents/chat', search: { session: newSess.id } })
    }
  }

  const renameChatSession = async (id: string, title: string) => {
    const res = await fetch(`/api/chat-sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    if (res.ok) {
      await loadChatSessions()
    }
  }

  const linkNoteToSession = async (sessId: string, noteId: string) => {
    const res = await fetch(`/api/chat-sessions/${sessId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId })
    })
    if (res.ok) {
      await loadChatSessions()
    }
  }

  const deleteChatSession = async (id: string) => {
    const res = await fetch(`/api/chat-sessions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      await loadChatSessions()
      if (session === id) {
        const remaining = chatSessionsList.filter(s => s.id !== id)
        if (remaining.length > 0) {
          navigate({ to: '/documents/chat', search: { session: remaining[0].id } })
        } else {
          navigate({ to: '/documents/chat' })
        }
      }
    }
  }

  const handleToggle = (doc: { id: string; name: string }) => {
    setPinnedDocs(prev =>
      prev.some(d => d.id === doc.id)
        ? prev.filter(d => d.id !== doc.id)
        : [...prev, doc]
    )
  }

  const activeSession = chatSessionsList.find(s => s.id === session)
  const activeSessionNoteId = activeSession?.noteId

  // Build the hierarchical note tree from flat list
  const noteTree = buildNoteTree(notesList)

  // Recursive renderer for parent-child tree inside custom dropdown panel
  const renderNoteOptions = (nodes: NoteTreeNode[], depth: number = 0) => {
    const result: React.ReactNode[] = []
    
    for (const node of nodes) {
      const isSelected = activeSessionNoteId === node.id
      result.push(
        <button
          key={node.id}
          onClick={() => {
            linkNoteToSession(session, node.id)
            setNoteDropdownOpen(false)
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px',
            paddingLeft: `${10 + depth * 16}px`, // Visual parent-child indent
            border: 'none', borderRadius: 7,
            background: isSelected ? 'var(--accent)' : 'transparent',
            color: isSelected ? 'var(--primary)' : 'var(--fg)',
            cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-body)',
            transition: 'background 0.1s',
            marginTop: 2
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--muted)' }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
            {node.children.length > 0 ? (
              <span style={{ marginRight: 6, opacity: 0.7, fontSize: '0.85rem' }}>📁</span>
            ) : (
              <span style={{ marginRight: 6, opacity: 0.7, fontSize: '0.85rem' }}>📄</span>
            )}
            <span style={{ fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.title || 'Untitled Note'}
            </span>
          </div>
          {isSelected && <Check size={13} style={{ flexShrink: 0, marginLeft: 8 }} />}
        </button>
      )
      
      // Recurse children
      if (node.children.length > 0) {
        result.push(...renderNoteOptions(node.children, depth + 1))
      }
    }
    
    return result
  }

  return (
    <>
    <RagLayout noPadding>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* Column 1: Sesi Chat (History) */}
        <div style={{
          width: 240,
          borderRight: '1px solid var(--border)',
          background: '#0a0a0c',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          padding: '16px 12px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Chat History
            </span>
            <button
              onClick={createChatSession}
              title="Start new chat"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: 4, border: 'none',
                background: 'var(--primary)', color: 'var(--primary-fg)', cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <Plus size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
            {chatSessionsList.map(sess => {
              const isActive = session === sess.id
              const isEditing = editingChatId === sess.id

              return (
                <div
                  key={sess.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6,
                    background: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--fg)',
                    fontSize: '0.8rem', position: 'relative', cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onClick={() => {
                    if (!isEditing) {
                      navigate({ to: '/documents/chat', search: { session: sess.id } })
                    }
                  }}
                  onDoubleClick={() => {
                    setEditingChatId(sess.id)
                    setEditChatValue(sess.title)
                  }}
                  onMouseEnter={() => setHoverChatId(sess.id)}
                  onMouseLeave={() => setHoverChatId(null)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <MessageSquare size={13} style={{ marginRight: 8, flexShrink: 0, color: isActive ? 'var(--primary)' : 'var(--fg-muted)' }} />
                    {isEditing ? (
                      <input
                        value={editChatValue}
                        onChange={e => setEditChatValue(e.target.value)}
                        onBlur={() => {
                          renameChatSession(sess.id, editChatValue.trim() || 'Chat Baru')
                          setEditingChatId(null)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            renameChatSession(sess.id, editChatValue.trim() || 'Chat Baru')
                            setEditingChatId(null)
                          } else if (e.key === 'Escape') {
                            setEditingChatId(null)
                          }
                        }}
                        autoFocus
                        style={{
                          background: 'var(--bg)', border: '1px solid var(--primary)',
                          borderRadius: 4, color: 'var(--fg)', fontSize: '0.78rem',
                          padding: '2px 4px', width: '100%', outline: 'none'
                        }}
                      />
                    ) : (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 500 : 400 }}>
                        {sess.title}
                      </span>
                    )}
                  </div>
                  {!isEditing && (isActive || hoverChatId === sess.id) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingChatId(sess.id); setEditChatValue(sess.title) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--fg-subtle)', padding: 2, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          borderRadius: 3,
                        }}
                        title="Rename chat"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: sess.id, title: sess.title }) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--fg-subtle)', padding: 2, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          borderRadius: 3,
                        }}
                        title="Delete chat"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Column 2: Panel Dokumen RAG */}
        <RagDocPanel pinnedDocs={pinnedDocs} onToggle={handleToggle} />

        {/* Column 3: Layar Chat */}
        {session && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minWidth: 0 }}>
            {/* Header bar for note context selection */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
              background: '#121214', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} ref={noteDropdownRef}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--fg-muted)' }}>
                  Reference Note:
                </span>
                
                {/* Custom Dropdown Trigger */}
                <button
                  onClick={() => setNoteDropdownOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '6px 12px', minWidth: 220, maxWidth: 320,
                    fontSize: '0.78rem', fontWeight: 500, fontFamily: 'var(--font-body)',
                    border: `1px solid ${noteDropdownOpen ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 8, outline: 'none',
                    color: 'var(--fg)', background: 'var(--bg)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    {activeSessionNoteId 
                      ? (notesList.find(n => n.id === activeSessionNoteId)?.title || 'Untitled Note')
                      : 'No Note Reference (General RAG)'
                    }
                  </span>
                  <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--fg-muted)', transform: noteDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>

                {/* Custom Dropdown Panel */}
                {noteDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 95,
                    width: 260, maxHeight: 300, overflowY: 'auto',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 10, zIndex: 1000,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    padding: '4px',
                  }}>
                    {/* "No Note Reference" Option */}
                    <button
                      onClick={() => {
                        linkNoteToSession(session, 'none')
                        setNoteDropdownOpen(false)
                      }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', border: 'none', borderRadius: 7,
                        background: !activeSessionNoteId ? 'var(--accent)' : 'transparent',
                        color: !activeSessionNoteId ? 'var(--primary)' : 'var(--fg)',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'var(--font-body)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (activeSessionNoteId) e.currentTarget.style.background = 'var(--muted)' }}
                      onMouseLeave={e => { if (activeSessionNoteId) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>No Note Reference</span>
                      {!activeSessionNoteId && <Check size={13} style={{ flexShrink: 0 }} />}
                    </button>

                    {/* Hierarchical note options */}
                    {renderNoteOptions(noteTree, 0)}
                  </div>
                )}
              </div>
            </div>

            <ChatBot
              mode="rag"
              pinnedDocs={pinnedDocs}
              fullWidth
              chatSessionId={session}
            />
          </div>
        )}
      </div>
    </RagLayout>

    <ConfirmDialog
      open={!!deleteTarget}
      title="Hapus Chat"
      description={<>Yakin ingin menghapus <strong style={{ color: 'var(--fg)' }}>&#34;{deleteTarget?.title}&#34;</strong>? Semua pesan dalam sesi ini akan dihapus secara permanen.</>}
      confirmLabel="Hapus"
      cancelLabel="Batal"
      onConfirm={() => { if (deleteTarget) deleteChatSession(deleteTarget.id) }}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  )
}
