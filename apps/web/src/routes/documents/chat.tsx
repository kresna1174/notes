import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChatBot } from '#/modules/chat'
import { RagLayout, RagDocPanel } from '#/modules/shared/ui'

export const Route = createFileRoute('/documents/chat')({
  component: RagChatPage,
})

function RagChatPage() {
  const [pinnedDocs, setPinnedDocs] = useState<{ id: string; name: string }[]>([])

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
        <ChatBot
          mode="rag"
          pinnedDocs={pinnedDocs}
          fullWidth
        />
      </div>
    </RagLayout>
  )
}
