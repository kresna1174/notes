import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '#/modules/sidebar'
import { Plus, Brain } from 'lucide-react'

export const Route = createFileRoute('/')({
  loader: async () => {
    const res = await fetch('/api/notes?scope=mine')
    if (!res.ok) return
    const notes = await res.json()
    if (Array.isArray(notes) && notes.length > 0) {
      throw redirect({ to: '/notes/$id', params: { id: notes[0].id } })
    }
  },
  component: EmptyPage,
})

function EmptyPage() {
  const navigate = useNavigate()

  async function createNote() {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', content: '{}' }),
    })
    if (!res.ok) return
    const note = await res.json()
    if (note?.id) navigate({ to: '/notes/$id', params: { id: note.id } })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--accent)', color: 'var(--primary)' }}>
            <Brain size={32} />
          </div>
          <p className="font-semibold mb-1" style={{ color: 'var(--fg)', fontSize: '0.9375rem' }}>Belum ada catatan</p>
          <p className="text-sm mb-5" style={{ color: 'var(--fg-muted)' }}>Buat catatan pertamamu sekarang</p>
          <button
            onClick={createNote}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', fontSize: '0.875rem', fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: 'var(--primary)', color: 'var(--primary-fg)',
              border: 'none', borderRadius: 10, cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={15} /> Buat Catatan
          </button>
        </div>
      </main>
    </div>
  )
}
