import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Editor } from '../components/editor/Editor'
import { PinLockModal } from '../components/editor/PinLockModal'
import { useState, useEffect } from 'react'
import { Check, Loader2, Circle } from 'lucide-react'

export const Route = createFileRoute('/notes/$id')({
  component: NotePageComponent,
})

type SaveStatus = 'saved' | 'saving' | 'unsaved'

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 24,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: '0.75rem',
      fontFamily: 'var(--font-body)',
      color: status === 'saved' ? 'var(--fg-subtle)' : status === 'saving' ? 'var(--primary)' : '#f08c00',
      background: 'var(--save-bg)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: '5px 12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      transition: 'color 0.2s',
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      {status === 'saved' && <><Check size={12} strokeWidth={2.5} /> Saved</>}
      {status === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving…</>}
      {status === 'unsaved' && <><Circle size={10} fill="currentColor" strokeWidth={0} /> Unsaved</>}
    </div>
  )
}

function NotePageComponent() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [shareTrigger, setShareTrigger] = useState(0)
  const [note, setNote] = useState<{ id: string; title: string; content: string; createdAt: number; updatedAt: number; isLocked?: boolean; shareToken?: string | null; hasPinProtection?: boolean; createdByUsername?: string | null; updatedByUsername?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [unlocked, setUnlocked] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)

  useEffect(() => {
    setLoading(true)
    setSaveStatus('saved')
    setUnlocked(false)
    setShowUnlockModal(false)
    fetch(`/api/notes/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setNote(data)
        setLoading(false)
        if (data?.isLocked) setShowUnlockModal(true)
      })
  }, [id])

  async function handleUpdate(fields: { title?: string; content?: string }) {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
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
      <Sidebar
        activeNoteId={id}
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
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
        {loading ? (
          <div className="px-10 py-10">
            <div className="animate-pulse">
              <div className="h-8 rounded-lg mb-6" style={{ background: 'var(--skeleton)', width: '60%' }} />
              <div className="h-4 rounded mb-3" style={{ background: 'var(--skeleton)', width: '100%' }} />
              <div className="h-4 rounded mb-3" style={{ background: 'var(--skeleton)', width: '80%' }} />
              <div className="h-4 rounded" style={{ background: 'var(--skeleton)', width: '90%' }} />
            </div>
          </div>
        ) : !note ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: '#6c757d' }}>Note not found.</p>
          </div>
        ) : isContentVisible ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <Editor
              note={note}
              onUpdate={handleUpdate}
              onSaveStatusChange={setSaveStatus}
              onLockChange={locked => {
                setNote(prev => prev ? { ...prev, isLocked: locked } : prev)
                if (locked) setUnlocked(false)
              }}
              shareTrigger={shareTrigger}
            />
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
      </main>
      {!loading && note && isContentVisible && <SaveIndicator status={saveStatus} />}

      {showUnlockModal && (
        <PinLockModal
          mode="unlock"
          onSubmit={handleUnlock}
          onClose={() => setShowUnlockModal(false)}
        />
      )}
    </div>
  )
}
