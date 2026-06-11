import { createFileRoute, redirect } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar/Sidebar'

export const Route = createFileRoute('/')({
  loader: async () => {
    const res = await fetch('/api/notes')
    const notes = await res.json()
    if (notes.length > 0) {
      throw redirect({ to: '/notes/$id', params: { id: notes[0].id } })
    }
  },
  component: () => (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={null} />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No notes yet</p>
          <p className="text-sm mt-1">Click "New Note" to get started</p>
        </div>
      </main>
    </div>
  ),
})
