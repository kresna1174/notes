# RAG Chat Fullwidth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/documents/chat` — a fullwidth chat page with a left document panel for pinning RAG sources, reusing the existing ChatBot component made polymorphic.

**Architecture:** Generalize `ChatBot` with `mode`, `pinnedDocs`, and `fullWidth` props while keeping `mode='note'` behavior identical. Add `RagDocPanel` as a standalone component that owns nothing — it calls `onToggle` and receives `pinnedDocs` from the parent page. Route `/documents/chat` composes both with `RagLayout`'s new `noPadding` prop.

**Tech Stack:** React, TanStack Router, `@ai-sdk/react`, `lucide-react`, existing `ragApi.ts`

## Global Constraints

- Do NOT break existing `ChatBot` in note mode — all existing props remain valid and behavior is unchanged
- Use `var(--*)` CSS variables for all colors — no hardcoded hex
- Follow existing inline style pattern (no new CSS classes)
- TanStack Router auto-generates `routeTree.gen.ts` — do NOT edit it manually; the dev server regenerates it on file save
- Session ID for RAG chat is the fixed string `"rag-global"`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/modules/chat/ChatBot.tsx` | Modify | Add `mode`, `pinnedDocs`, `fullWidth` props |
| `apps/web/src/modules/shared/ui/RagDocPanel.tsx` | Create | Left panel — list & pin RAG documents |
| `apps/web/src/modules/shared/ui/RagLayout.tsx` | Modify | Add `noPadding` prop |
| `apps/web/src/modules/shared/ui/index.ts` | Modify | Export `RagDocPanel` |
| `apps/web/src/routes/documents/chat.tsx` | Create | `/documents/chat` route page |
| `apps/web/src/modules/shared/ui/RagLayout.tsx` | Modify | Update Ask AI nav link to `/documents/chat` |

---

### Task 1: Add `noPadding` prop to RagLayout + update Ask AI nav link

**Files:**
- Modify: `apps/web/src/modules/shared/ui/RagLayout.tsx`

**Interfaces:**
- Produces: `RagLayout` accepts `{ children, noPadding?: boolean }`

- [x] **Step 1: Add `noPadding` prop and update nav link**

Open `apps/web/src/modules/shared/ui/RagLayout.tsx`. Make two changes:

**Change 1** — update the function signature and prop type:
```tsx
export function RagLayout({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
```

**Change 2** — update navItems, change Ask AI link from `/ask-agent` to `/documents/chat`:
```tsx
const navItems = [
  { to: '/documents', label: 'Documents', icon: Library },
  { to: '/documents/pages', label: 'Pages', icon: FileStack },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/documents/chat', label: 'Ask AI', icon: MessageSquare },
] as const
```

**Change 3** — in the "Scrollable Workspace Pane" div (currently has `padding` and a `maxWidth: 800px` inner div), conditionally skip padding and maxWidth:
```tsx
{/* Scrollable Workspace Pane */}
<div
  className="flex-1 overflow-y-auto"
  style={noPadding ? { background: 'var(--bg-app)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : {
    padding: isMobile ? '24px 16px 40px' : '40px 60px',
    background: 'var(--bg-app)',
  }}
>
  {noPadding ? children : (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {children}
    </div>
  )}
</div>
```

- [x] **Step 2: Verify dev server compiles**

Run: `npm run dev` (from repo root)
Expected: no TypeScript errors in terminal, page loads at `/documents`

- [x] **Step 3: Commit**

```bash
git add apps/web/src/modules/shared/ui/RagLayout.tsx
git commit -m "feat: add noPadding prop to RagLayout, update Ask AI nav to /documents/chat"
```

---

### Task 2: Create RagDocPanel component

**Files:**
- Create: `apps/web/src/modules/shared/ui/RagDocPanel.tsx`
- Modify: `apps/web/src/modules/shared/ui/index.ts`

**Interfaces:**
- Consumes: `listDocuments()` from `#/modules/shared/ragApi`, `DocumentMetadata` type
- Produces:
  ```ts
  interface RagDocPanelProps {
    pinnedDocs: { id: string; name: string }[]
    onToggle: (doc: { id: string; name: string }) => void
  }
  export function RagDocPanel(props: RagDocPanelProps): JSX.Element
  ```

- [x] **Step 1: Create RagDocPanel.tsx**

Create `apps/web/src/modules/shared/ui/RagDocPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { FileText, Upload, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { listDocuments, type DocumentMetadata } from '#/modules/shared/ragApi'

interface RagDocPanelProps {
  pinnedDocs: { id: string; name: string }[]
  onToggle: (doc: { id: string; name: string }) => void
}

export function RagDocPanel({ pinnedDocs, onToggle }: RagDocPanelProps) {
  const [docs, setDocs] = useState<DocumentMetadata[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const load = () => {
      listDocuments()
        .then(all => setDocs(all.filter(d => d.status === 'ready')))
        .catch(console.error)
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const pinnedIds = new Set(pinnedDocs.map(d => d.id))

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand document panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={14} />
        </button>
        {pinnedDocs.length > 0 && (
          <span
            style={{
              marginTop: 8,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              fontSize: '0.6rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {pinnedDocs.length}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 12px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg)' }}>
          Documents
          {pinnedDocs.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                fontSize: '0.62rem',
                fontWeight: 700,
              }}
            >
              {pinnedDocs.length} pinned
            </span>
          )}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Doc list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {docs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 16px',
              textAlign: 'center',
              gap: 10,
            }}
          >
            <Upload size={20} color="var(--fg-subtle)" />
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
              No documents ready.
            </p>
            <Link
              to="/documents"
              style={{
                fontSize: '0.72rem',
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Upload PDF →
            </Link>
          </div>
        ) : (
          docs.map(doc => {
            const isPinned = pinnedIds.has(doc.id)
            return (
              <button
                key={doc.id}
                onClick={() => onToggle({ id: doc.id, name: doc.name })}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 8px',
                  borderRadius: 6,
                  border: `1px solid ${isPinned ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                  background: isPinned ? 'rgba(59,130,246,0.07)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 2,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  if (!isPinned) e.currentTarget.style.background = 'var(--muted)'
                }}
                onMouseLeave={e => {
                  if (!isPinned) e.currentTarget.style.background = 'none'
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1.5px solid ${isPinned ? 'var(--primary)' : 'var(--border)'}`,
                    background: isPinned ? 'var(--primary)' : 'transparent',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}
                >
                  {isPinned && <Check size={10} color="var(--primary-fg)" strokeWidth={3} />}
                </div>
                <FileText size={13} color={isPinned ? 'var(--primary)' : 'var(--fg-muted)'} style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: isPinned ? 'var(--fg)' : 'var(--fg-muted)',
                    fontWeight: isPinned ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {doc.name}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>
          Pinned docs auto-attach to every message
        </p>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Export from index.ts**

Add to `apps/web/src/modules/shared/ui/index.ts`:
```ts
export { RagDocPanel } from './RagDocPanel';
```

- [x] **Step 3: Verify no compile errors**

Run: `npm run dev`
Expected: compiles clean, no TypeScript errors

- [x] **Step 4: Commit**

```bash
git add apps/web/src/modules/shared/ui/RagDocPanel.tsx apps/web/src/modules/shared/ui/index.ts
git commit -m "feat: add RagDocPanel component for pinning RAG documents"
```

---

### Task 3: Generalize ChatBot — add `mode`, `pinnedDocs`, `fullWidth` props

**Files:**
- Modify: `apps/web/src/modules/chat/ChatBot.tsx`

**Interfaces:**
- Consumes: same as existing + new props
- Produces:
  ```ts
  interface ChatBotProps {
    noteId?: string
    noteContent?: string
    noteTitle?: string
    onClose?: () => void
    mode?: 'note' | 'rag'
    pinnedDocs?: { id: string; name: string }[]
    fullWidth?: boolean
  }
  ```

- [x] **Step 1: Update props interface**

In `apps/web/src/modules/chat/ChatBot.tsx`, replace the existing `ChatBotProps` interface:

```tsx
interface ChatBotProps {
  noteId?: string
  noteContent?: string
  noteTitle?: string
  onClose?: () => void
  mode?: 'note' | 'rag'
  pinnedDocs?: { id: string; name: string }[]
  fullWidth?: boolean
}
```

- [x] **Step 2: Update function signature and derive mode values**

Change the function signature and add derived constants at the top of the component body:

```tsx
export function ChatBot({
  noteId,
  noteContent = '',
  noteTitle = '',
  onClose,
  mode = 'note',
  pinnedDocs = [],
  fullWidth = false,
}: ChatBotProps) {
  const isRagMode = mode === 'rag'
  const sessionId = isRagMode ? 'rag-global' : (noteId ?? 'default')
```

- [x] **Step 3: Update all uses of `noteId` that are passed as session_id**

Find the `DefaultChatTransport` setup (~line 448). Change it to use `sessionId`:

```tsx
transportRef.current = new DefaultChatTransport({
  api: '/api/ai/chat/stream',
  body: () => ({
    session_id: isRagMode ? 'rag-global' : noteStateRef.current.noteId,
    note_title: noteStateRef.current.noteTitle,
    note_content: noteStateRef.current.noteContent,
    attachments: attachmentsRef.current,
  }),
})
```

- [x] **Step 4: Update history fetch URL to use sessionId**

Find the `fetch(\`/api/ai/chat/history/${noteId}\`)` call (~line 494). Change to:

```tsx
fetch(`/api/ai/chat/history/${isRagMode ? 'rag-global' : noteId}`)
```

Also update the welcome message inside that fetch's `.then`:
```tsx
setMessages([{
  id: 'welcome',
  role: 'assistant',
  parts: [{
    type: 'text',
    text: isRagMode
      ? 'Hello! Ask anything from your pinned documents. Pin documents in the panel on the left.'
      : `Hello! I'm ready to help with the note **"${noteTitle || 'Untitled'}"**. What would you like to do?`
  }]
}])
```

- [x] **Step 5: Update the history fetch dependency array**

The `useEffect` for fetching history currently depends on `[noteId, setMessages]`. Update to:

```tsx
}, [isRagMode ? 'rag-global' : noteId, setMessages])
```

- [x] **Step 6: Update the RAG docs polling useEffect to use sessionId**

Find the `useEffect` with `intervalId` for fetching ragDocs (~line 423). Update the dependency:

```tsx
useEffect(() => {
  const fetchDocs = () => {
    listDocuments()
      .then(docs => setRagDocs(docs.filter(d => d.status === 'ready')))
      .catch(console.error)
  }
  fetchDocs()
  const intervalId = setInterval(fetchDocs, 5000)
  return () => clearInterval(intervalId)
}, [sessionId])
```

- [x] **Step 7: Inject pinnedDocs into handleSend**

Find `handleSend` (~line 538). Add pinned docs injection after the existing `referencedDocs` prefix:

```tsx
const handleSend = () => {
  if ((!inputValue.trim() && attachments.length === 0 && referencedDocs.length === 0 && pinnedDocs.length === 0) || isLoading) return
  
  let textToSend = inputValue
  if (attachments.length > 0) {
    const attachmentsPrefix = attachments.map(att => 
      `[Attached Document Content: "${att.filename}" filePath="${att.filePath}" mimeType="${att.mimeType}"]`
    ).join('\n')
    textToSend = `${attachmentsPrefix}\n\n${textToSend}`
  }
  
  // Inject pinned docs from panel (RAG mode)
  if (pinnedDocs.length > 0) {
    const pinnedPrefix = pinnedDocs.map(doc =>
      `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]`
    ).join('\n')
    textToSend = `${pinnedPrefix}\n\n${textToSend}`
  }
  
  // Inject manually-selected mention docs
  if (referencedDocs.length > 0) {
    const ragPrefix = referencedDocs.map(doc => 
      `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]`
    ).join('\n')
    textToSend = `${ragPrefix}\n\n${textToSend}`
  }
  
  sendMessage({ text: textToSend })
  setInputValue('')
  setAttachments([])
  setReferencedDocs([])
  if (textareaRef.current) textareaRef.current.style.height = 'auto'
}
```

- [x] **Step 8: Update quick prompts for RAG mode**

Find `quickPrompts` (~line 660). Change to:

```tsx
const quickPrompts = isRagMode ? [
  { label: '✦ Summarize pinned documents', text: 'Summarize the key points from the pinned documents.' },
  { label: '✦ Find main topics', text: 'What are the main topics covered in the pinned documents?' },
  { label: '✦ List key facts', text: 'List the most important facts from the pinned documents.' },
] : [
  { label: '✦ Summarize this note', text: 'Tolong panggil summarize_expert untuk meringkas seluruh isi catatan ini.' },
  { label: '✦ Create automatic tags', text: 'Tolong panggil tagger_expert untuk merekomendasikan tag berdasarkan isi catatan ini.' },
  { label: '✦ Find additional ideas', text: 'Berikan 3 ide tambahan yang bisa ditambahkan ke catatan ini.' },
]
```

- [x] **Step 9: Update the outer div to support fullWidth**

Find the outermost `<div>` of the return (currently has `width: '360px'`, `borderLeft`, etc.):

```tsx
<div
  style={{
    ...(fullWidth ? { flex: 1 } : { width: '360px', borderLeft: '1px solid var(--border)', flexShrink: 0 }),
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    fontFamily: 'var(--font-body)',
  }}
>
```

- [x] **Step 10: Update header — hide onClose button in RAG mode**

Find the header section with the `onClose` button and `noteTitle` display. Update:

```tsx
{/* ── Header ── */}
<div
  style={{
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
      AI
    </span>
    {!isRagMode && (
      <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
        · {noteTitle ? `"${noteTitle.length > 22 ? noteTitle.slice(0, 22) + '…' : noteTitle}"` : 'This note'}
      </span>
    )}
    {isRagMode && (
      <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
        · RAG Chat
      </span>
    )}
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <button
      onClick={handleClearHistory}
      title="Clear history"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--muted)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.background = 'none' }}
    >
      <Trash2 size={13} />
    </button>
    {!isRagMode && onClose && (
      <button
        onClick={onClose}
        title="Close"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--muted)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.background = 'none' }}
      >
        <X size={13} />
      </button>
    )}
  </div>
</div>
```

- [x] **Step 11: Update ToolCallBlock storageKey to use sessionId**

`ToolCallBlock` uses `noteId` in `storageKey`. It's passed as a prop `noteId`. In RAG mode, pass `"rag-global"` — update the call site inside ChatBot's render:

```tsx
<ToolCallBlock key={i} item={item} noteId={isRagMode ? 'rag-global' : (noteId ?? 'default')} lastUserPrompt={lastUserText} />
```

- [x] **Step 12: Verify no TS errors and existing note chat still works**

Run: `npm run dev`
Open a note, open chat — verify it still works exactly as before.

- [x] **Step 13: Commit**

```bash
git add apps/web/src/modules/chat/ChatBot.tsx
git commit -m "feat: generalize ChatBot to support rag mode with pinnedDocs and fullWidth props"
```

---

### Task 4: Create `/documents/chat` route page

**Files:**
- Create: `apps/web/src/routes/documents/chat.tsx`

**Interfaces:**
- Consumes:
  - `RagLayout` (noPadding prop)
  - `RagDocPanel` (pinnedDocs, onToggle)
  - `ChatBot` (mode='rag', pinnedDocs, fullWidth)

- [x] **Step 1: Create the route file**

Create `apps/web/src/routes/documents/chat.tsx`:

```tsx
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
```

- [x] **Step 2: Verify route is picked up**

Run: `npm run dev`
Navigate to `/documents/chat` — page should render with doc panel + chat.

TanStack Router auto-generates `routeTree.gen.ts` on dev server start — no manual edit needed.

- [x] **Step 3: Smoke test**

1. Visit `/documents/chat`
2. Doc panel shows on the left — if no docs, shows "Upload PDF →" link
3. Chat area renders with welcome message "Hello! Ask anything from your pinned documents."
4. Quick prompts show RAG-oriented options
5. Click a document in panel → it highlights blue with checkmark
6. Type a message and send → pinned doc appears as `📖 DocName` chip in the message bubble
7. Visit an existing note → open chat sidebar → confirm it still shows note-scoped chat (mode=note behavior unchanged)

- [x] **Step 4: Commit**

```bash
git add apps/web/src/routes/documents/chat.tsx
git commit -m "feat: add /documents/chat fullwidth RAG chat page"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `/documents/chat` route — Task 4
- ✅ RagLayout `noPadding` prop — Task 1
- ✅ Nav "Ask AI" → `/documents/chat` — Task 1
- ✅ `RagDocPanel` left panel with pin/unpin — Task 2
- ✅ Pinned docs collapse to badge when panel collapsed — Task 2
- ✅ `ChatBot` `mode='rag'` — Task 3
- ✅ `pinnedDocs` injected as `[Referenced Document]` prefix — Task 3 Step 7
- ✅ Fixed session `"rag-global"` — Task 3 Steps 3-5
- ✅ `fullWidth` removes 360px constraint — Task 3 Step 9
- ✅ RAG mode hides `onClose`, changes header label — Task 3 Step 10
- ✅ RAG mode quick prompts — Task 3 Step 8
- ✅ Empty state with upload link in panel — Task 2 Step 1
- ✅ `mode='note'` untouched — Task 3 (all changes gated on `isRagMode`)

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:**
- `{ id: string; name: string }` used consistently in `RagDocPanel` props, `ChatBot` props, and `handleToggle` in page
- `pinnedDocs` array type same across all tasks
- `sessionId` derived in ChatBot, not a new prop — consistent
