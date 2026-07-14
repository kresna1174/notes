import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { ChatBot } from '#/modules/chat'
import { RagLayout, RagDocPanel } from '#/modules/shared/ui'
import { Plus, MessageSquare, Trash2 } from 'lucide-react'

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

function RagChatPage() {
  const { session } = Route.useSearch()
  const navigate = useNavigate()
  const [pinnedDocs, setPinnedDocs] = useState<{ id: string; name: string }[]>([])
  
  // Chat sessions state
  const [chatSessionsList, setChatSessionsList] = useState<any[]>([])
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editChatValue, setEditChatValue] = useState('')
  const [hoverChatId, setHoverChatId] = useState<string | null>(null)
  
  // Notes list state for selector
  const [notesList, setNotesList] = useState<{ id: string; title: string }[]>([])

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

  return (
    <RagLayout noPadding>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* Column 1: Sesi Chat (History) */}
        <div style={{
          width: 240,
          borderRight: '1px solid var(--border)',
          background: 'var(--card-bg)',
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
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChatSession(sess.id) }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--fg-subtle)', padding: 2, display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                      }}
                      title="Delete chat"
                    >
                      <Trash2 size={12} />
                    </button>
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
              background: 'var(--card-bg)', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--fg-muted)' }}>
                  Reference Note:
                </span>
                <select
                  value={activeSessionNoteId || 'none'}
                  onChange={(e) => linkNoteToSession(session, e.target.value)}
                  style={{
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '3px 8px', fontSize: '0.78rem', color: 'var(--fg)',
                    outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="none">No Note Reference (General RAG)</option>
                  {notesList.map(n => (
                    <option key={n.id} value={n.id}>{n.title || 'Untitled Note'}</option>
                  ))}
                </select>
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
  )
}
