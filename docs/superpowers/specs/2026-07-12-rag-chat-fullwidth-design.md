# RAG Chat Fullwidth Page

**Date:** 2026-07-12  
**Branch:** feat/mindspace-rebrand

## Goal

Add a fullwidth chat page at `/documents/chat` where users can chat with AI using RAG documents as context. Users can pin/unpin documents from a left panel — pinned docs are auto-injected as `[Referenced Document]` references into every message sent. Chat history persists via a fixed session ID `"rag-global"`.

## Architecture

### 1. ChatBot Refactor (Polymorphic)

Generalize existing `ChatBot` component to support `mode='note'` (existing) and `mode='rag'` (new).

**New/changed props:**
```ts
interface ChatBotProps {
  // existing — all become optional
  noteId?: string
  noteContent?: string
  noteTitle?: string
  onClose?: () => void

  // new
  mode?: 'note' | 'rag'           // default: 'note'
  pinnedDocs?: { id: string; name: string }[]  // injected from doc panel
  fullWidth?: boolean              // flex-1 instead of 360px fixed
}
```

**Mode behavior:**
- `mode='note'` — zero behavior change, all existing logic unchanged
- `mode='rag'`:
  - `session_id = "rag-global"` (fixed, persistent history)
  - `note_title` and `note_content` sent as empty strings
  - Welcome message: `"Hello! Ask anything from your documents."`
  - Quick prompts: RAG-oriented (summarize all docs, find key topics, compare documents)
  - Header: no `onClose` button, no note title display
- `pinnedDocs`: on every `handleSend`, prepend each pinned doc as `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]` before message text — same format already parsed by ChatBot's message renderer
- `fullWidth=true`: remove `width: '360px'`, `borderLeft`, `flexShrink: 0` — set `flex: 1` instead

### 2. RagDocPanel Component

New file: `apps/web/src/modules/shared/ui/RagDocPanel.tsx`

- Loads documents via `listDocuments()`, filters `status === 'ready'`
- Polls every 5s (same as ChatBot)
- Each doc row: click to toggle pinned state
- Pinned = blue highlight + checkmark icon
- Panel width: ~260px, collapsible (toggle button at top)
- Empty state: link to `/documents` to upload
- Props: `pinnedDocs`, `onToggle(doc)`

### 3. Route: `/documents/chat`

New file: `apps/web/src/routes/documents/chat.tsx`

- Uses `RagLayout` with `noPadding` prop (override scrollable area padding)
- Layout: `flex h-full` — `RagDocPanel` (260px) + `ChatBot` (flex-1, mode='rag', fullWidth)
- No `maxWidth` constraint (unlike other RAG pages that use `maxWidth: 800px`)
- State: `pinnedDocs` array managed in this page, passed down to both panel and chatbot

### 4. RagLayout Tweak

Add optional `noPadding?: boolean` prop to `RagLayout`.

When `noPadding=true`, the scrollable workspace pane renders `children` without padding and without `maxWidth: 800px` constraint — so `/documents/chat` gets full height/width.

### 5. Nav Update

In `RagLayout.tsx` navItems, change Ask AI link:
- From: `/ask-agent`  
- To: `/documents/chat`

`/ask-agent/index.tsx` redirect can stay pointing to `/documents` (or update to `/documents/chat`).

## Data Flow

```
RagDocPanel (owns pin state) 
  → pinnedDocs[] 
  → RagChatPage (local state)
  → ChatBot (pinnedDocs prop)
    → handleSend: prepend [Referenced Document] tags
    → /api/ai/chat/stream (session_id: "rag-global")
```

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/modules/chat/ChatBot.tsx` | Add `mode`, `pinnedDocs`, `fullWidth` props |
| `apps/web/src/modules/shared/ui/RagDocPanel.tsx` | New component |
| `apps/web/src/routes/documents/chat.tsx` | New route |
| `apps/web/src/modules/shared/ui/RagLayout.tsx` | Add `noPadding` prop |
| `apps/web/src/modules/shared/ui/index.ts` | Export `RagDocPanel` |

## Out of Scope

- Backend changes — `/api/ai/chat/stream` already supports arbitrary `session_id`
- New quick prompts content (placeholder text fine for now)
- Mobile layout for doc panel (hide on mobile, show toggle button)
