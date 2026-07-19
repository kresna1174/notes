import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '#/modules/sidebar'
import { Editor, PinLockModal, VersionHistory, SearchPalette } from '#/modules/editor'
import { ChatBot } from '#/modules/chat'
import { useState, useEffect } from 'react'
import { Check, Loader2, Circle, PanelLeftClose, PanelLeftOpen, Database } from 'lucide-react'

export const Route = createFileRoute('/notes/$id')({
  loader: async ({ params }) => {
    const res = await fetch(`/api/notes/${params.id}`)
    if (!res.ok) return null
    return res.json() as Promise<{ id: string; title: string; content: string; createdAt: number; updatedAt: number; isLocked?: boolean; shareToken?: string | null; hasPinProtection?: boolean; createdByUsername?: string | null; updatedByUsername?: string | null }>
  },
  pendingComponent: NoteLoadingSkeleton,
  component: NotePageComponent,
})

function NoteLoadingSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden">
      <div style={{ flexShrink: 0 }}>
        <Sidebar activeNoteId={null} />
      </div>
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg)', position: 'relative' }}>
        <div className="px-10 py-10">
          <div className="animate-pulse">
            <div className="h-8 rounded-lg mb-6" style={{ background: 'var(--skeleton)', width: '60%' }} />
            <div className="h-4 rounded mb-3" style={{ background: 'var(--skeleton)', width: '100%' }} />
            <div className="h-4 rounded mb-3" style={{ background: 'var(--skeleton)', width: '80%' }} />
            <div className="h-4 rounded" style={{ background: 'var(--skeleton)', width: '90%' }} />
          </div>
        </div>
      </main>
    </div>
  )
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'generating'

type IndexStatus = 'idle' | 'indexing' | 'indexed' | 'error'

function SaveIndicator({ status, sidebarOpen, isMobile, historyOpen }: { status: SaveStatus; sidebarOpen: boolean; isMobile: boolean; historyOpen: boolean }) {
  if (isMobile && sidebarOpen) return null

  const bottomOffset = historyOpen ? 280 + 12 : 20

  return (
    <div style={{
      position: 'absolute',
      bottom: bottomOffset,
      right: sidebarOpen ? 404 : 24,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: '0.75rem',
      fontFamily: 'var(--font-body)',
      color: status === 'saved' ? 'var(--fg-subtle)' : status === 'saving' ? 'var(--primary)' : status === 'generating' ? 'var(--fg-subtle)' : '#f08c00',
      background: 'var(--save-bg)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: '5px 12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      transition: 'right 0.2s ease, bottom 0.2s ease, color 0.2s',
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      {status === 'saved' && <><Check size={12} strokeWidth={2.5} /> Saved</>}
      {status === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving…</>}
      {status === 'generating' && <><Loader2 size={12} className="animate-spin" /> Thinking…</>}
      {status === 'unsaved' && <><Circle size={10} fill="currentColor" strokeWidth={0} /> Unsaved</>}
    </div>
  )
}

function IndexButton({
  noteId,
  noteTitle,
  noteContent,
  saveStatus,
  sidebarOpen,
  isMobile,
  historyOpen,
}: {
  noteId: string
  noteTitle: string
  noteContent: string
  saveStatus: SaveStatus
  sidebarOpen: boolean
  isMobile: boolean
  historyOpen: boolean
}) {
  const [status, setStatus] = useState<IndexStatus>('idle')

  if (isMobile && sidebarOpen) return null

  const bottomOffset = historyOpen ? 280 + 12 : 20
  const isDisabled = saveStatus !== 'saved' || status === 'indexing'

  const handleIndex = async () => {
    if (isDisabled) return
    setStatus('indexing')
    try {
      const res = await fetch(`/api/ai/notes-index/${noteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteTitle, content: noteContent, user_id: '' }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('indexed')
    } catch {
      setStatus('error')
    } finally {
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const color =
    status === 'indexed' ? '#22c55e' :
    status === 'error' ? '#ef4444' :
    isDisabled ? 'var(--fg-subtle)' :
    'var(--fg-muted)'

  return (
    <div
      onClick={handleIndex}
      title={
        saveStatus !== 'saved' ? 'Save the note first before indexing' :
        status === 'indexing' ? 'Indexing…' :
        status === 'indexed' ? 'Indexed to RAG ✓' :
        status === 'error' ? 'Indexing failed — try again' :
        'Index this note to RAG search'
      }
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        right: sidebarOpen ? 404 + 120 : 24 + 120,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.75rem',
        fontFamily: 'var(--font-body)',
        color,
        background: 'var(--save-bg)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '5px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'right 0.2s ease, bottom 0.2s ease, color 0.2s',
        cursor: isDisabled ? 'default' : 'pointer',
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {status === 'indexing' ? (
        <><Loader2 size={12} className="animate-spin" /> Indexing…</>
      ) : status === 'indexed' ? (
        <><Check size={12} strokeWidth={2.5} /> Indexed</>
      ) : status === 'error' ? (
        <><Database size={12} /> Failed</>
      ) : (
        <><Database size={12} /> Index</>
      )}
    </div>
  )
}

function NotePageComponent() {
  const { id } = Route.useParams()
  const initialNote = Route.useLoaderData()
  const navigate = useNavigate()
  const [shareTrigger, setShareTrigger] = useState(0)
  const [notesUpdateTrigger, setNotesUpdateTrigger] = useState(0)
  const [note, setNote] = useState(initialNote)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [unlocked, setUnlocked] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [showSearchPalette, setShowSearchPalette] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowSearchPalette(true)
      }
    }
    
    function handleOpenPalette() {
      setShowSearchPalette(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-search-palette', handleOpenPalette)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-search-palette', handleOpenPalette)
    }
  }, [])

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    setNote(initialNote)
    setSaveStatus('saved')
    setUnlocked(false)
    setShowUnlockModal(false)
    if (initialNote?.isLocked) setShowUnlockModal(true)
  }, [initialNote])

  async function handleUpdate(fields: { title?: string; content?: string }) {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setNotesUpdateTrigger(prev => prev + 1)
  }

  async function handleUnlock(pin: string): Promise<boolean> {
    const r = await fetch(`/api/notes/${id}/pin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    if (!r.ok) return false
    setUnlocked(true)
    setShowUnlockModal(false)
    return true
  }

  const isContentVisible = !note?.isLocked || unlocked

  return (
    <div className="flex h-screen overflow-hidden">
      <div style={isMobile ? { position: 'absolute', width: 0, height: 0, overflow: 'visible' } : {
        width: sidebarVisible ? undefined : 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        flexShrink: 0,
      }}>
        <Sidebar
          activeNoteId={id}
          notesUpdateTrigger={notesUpdateTrigger}
          onShareNote={(noteId) => {
            if (noteId === id) {
              setShareTrigger(prev => prev + 1)
            } else {
              navigate({ to: '/notes/$id', params: { id: noteId } }).then(() => {
                setTimeout(() => {
                  setShareTrigger(prev => prev + 1)
                }, 100)
              })
            }
          }}
        />
      </div>
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg)', position: 'relative' }}>
        {!isMobile && (
          <button
            onClick={() => setSidebarVisible(v => !v)}
            title={sidebarVisible ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
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
            {sidebarVisible ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        )}
        {!note ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: '#6c757d' }}>Note not found.</p>
          </div>
        ) : isContentVisible ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
              <Editor
                key={note.id}
                note={note}
                onUpdate={handleUpdate}
                onSaveStatusChange={setSaveStatus}
                onLockChange={locked => {
                  setNote(prev => prev ? { ...prev, isLocked: locked } : prev)
                  if (locked) setUnlocked(false)
                }}
                shareTrigger={shareTrigger}
                chatOpen={chatOpen}
                onToggleChat={() => {
                  setChatOpen(v => !v)
                  setHistoryOpen(false)
                }}
                historyOpen={historyOpen}
                onToggleHistory={() => {
                  setHistoryOpen(v => !v)
                  setChatOpen(false)
                }}
              />
              {chatOpen && (
                <ChatBot
                  noteId={id}
                  noteContent={note.content}
                  noteTitle={note.title}
                  onClose={() => setChatOpen(false)}
                />
              )}
            </div>
            {historyOpen && (
              <VersionHistory
                noteId={id}
                currentContent={note.content}
                onClose={() => setHistoryOpen(false)}
                onRestore={(updatedNote) => {
                  window.location.reload()
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center flex-col" style={{ gap: 12 }}>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Catatan ini terkunci.</p>
            <button
              onClick={() => setShowUnlockModal(true)}
              style={{
                padding: '8px 20px', fontSize: '0.8rem', fontWeight: 600,
                border: '1px solid var(--primary)', borderRadius: 20,
                background: 'var(--accent)', color: 'var(--primary)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Buka Kunci
            </button>
          </div>
        )}
        {note && isContentVisible && (
          <>
            <SaveIndicator status={saveStatus} sidebarOpen={chatOpen} isMobile={isMobile} historyOpen={historyOpen} />
            <IndexButton
              noteId={note.id}
              noteTitle={note.title}
              noteContent={note.content}
              saveStatus={saveStatus}
              sidebarOpen={chatOpen}
              isMobile={isMobile}
              historyOpen={historyOpen}
            />
          </>
        )}
      </main>

      {showUnlockModal && (
        <PinLockModal
          mode="unlock"
          onSubmit={handleUnlock}
          onClose={() => setShowUnlockModal(false)}
        />
      )}

      {showSearchPalette && (
        <SearchPalette
          onClose={() => setShowSearchPalette(false)}
          onSelectNote={(noteId) => {
            navigate({ to: `/notes/${noteId}` })
            setShowSearchPalette(false)
          }}
        />
      )}
    </div>
  )
}
