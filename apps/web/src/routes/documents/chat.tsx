import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { ChatBot } from '#/modules/chat'
import { RagLayout, RagDocPanel } from '#/modules/shared/ui'

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

  const handleToggle = (doc: { id: string; name: string }) => {
    setPinnedDocs(prev =>
      prev.some(d => d.id === doc.id)
        ? prev.filter(d => d.id !== doc.id)
        : [...prev, doc]
    )
  }

  return (
    <RagLayout noPadding>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <RagDocPanel pinnedDocs={pinnedDocs} onToggle={handleToggle} />
        {session && (
          <ChatBot
            mode="rag"
            pinnedDocs={pinnedDocs}
            fullWidth
            chatSessionId={session}
          />
        )}
      </div>
    </RagLayout>
  )
}
