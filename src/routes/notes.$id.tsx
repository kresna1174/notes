import { createFileRoute } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar/Sidebar'
import { Editor } from '../components/editor/Editor'
import { useState, useEffect } from 'react'

export const Route = createFileRoute('/notes/$id')({
  component: NotePageComponent,
})

function NotePageComponent() {
  const { id } = Route.useParams()
  const [note, setNote] = useState<{ id: string; title: string; content: string } | null>(null)

  useEffect(() => {
    fetch(`/api/notes/${id}`)
      .then(r => r.json())
      .then(setNote)
  }, [id])

  async function handleUpdate(fields: { title?: string; content?: string }) {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeNoteId={id} />
      <main className="flex-1 overflow-y-auto">
        {note && <Editor note={note} onUpdate={handleUpdate} />}
      </main>
    </div>
  )
}
