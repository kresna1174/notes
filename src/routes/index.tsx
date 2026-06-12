import { createFileRoute, redirect } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar/Sidebar'

export const Route = createFileRoute('/')({
  loader: async () => {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const notes = await res.json()
    if (Array.isArray(notes) && notes.length > 0) {
      throw redirect({ to: '/notes/$id', params: { id: notes[0].id } })
    }
  },
  component: () => (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 flex items-center justify-center" style={{ background: '#ffffff' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#e8edff' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </div>
          <p className="font-semibold mb-1" style={{ color: '#1a1a2e', fontSize: '0.9375rem' }}>No notes yet</p>
          <p className="text-sm" style={{ color: '#6c757d' }}>Click <strong style={{ color: '#3b5bdb' }}>+ New Note</strong> to get started</p>
        </div>
      </main>
    </div>
  ),
})
