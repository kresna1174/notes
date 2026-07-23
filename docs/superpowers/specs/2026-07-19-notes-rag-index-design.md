# Notes RAG Index — Design Spec

**Date:** 2026-07-19
**Status:** Draft

## Overview

Index user notes into ChromaDB (`note_pages` collection) so the AI can search across both uploaded documents and notes with a single `search_knowledge` tool. Sync happens automatically every 5 minutes (Celery Beat) using content-hash diffing to avoid redundant re-indexing. User can also manually trigger indexing via a button in the note editor.

---

## Goals

- AI can search notes + RAG documents in one call via `search_knowledge`
- No re-indexing on every save — only when content actually changes
- User can manually force-index a note via UI button
- Note deletion triggers cleanup from ChromaDB + `note_index` table
- No changes to existing `documents_v2` collection or `search_rag_documents` tool behavior

---

## Architecture

```
Web App (Next.js)                      ai-agent (FastAPI + Celery)
──────────────────                     ───────────────────────────
"Index" button in $id.tsx  ─────────► POST /api/notes-index/{note_id}
(next to SaveIndicator)                       │
                                              ▼
                                      Celery task: index_note_task
                                              │
                                   ┌──────────┴──────────┐
                                   ▼                     ▼
                             strip TipTap JSON     hash(title+content)
                             → plain text          check note_index table
                                   │                     │
                                   ▼                     ▼
                             chunk(800/150)         same? → skip
                             → embed (Mistral)      diff? → re-index
                                   │
                                   ▼
                             ChromaDB "note_pages"
                             delete where note_id=X → insert chunks

Celery Beat (every 5 min):
  SELECT id, title, content, user_id FROM notes   ← shared PostgreSQL DB
  → hash check per note
  → index only changed notes
  → cleanup notes deleted from DB but still in note_index
```

---

## New Components

### Backend — `apps/ai-agent/`

| File | Responsibility |
|------|----------------|
| `modules/notes_index/models.py` | `NoteIndex` SQLAlchemy model: `note_id`, `content_hash`, `indexed_at`, `user_id` |
| `modules/notes_index/methods.py` | `index_note()`, `delete_note_index()`, `strip_tiptap_json()`, `hash_content()` |
| `modules/notes_index/tasks.py` | `index_note_task` Celery task, `sync_notes_task` Celery Beat periodic task |
| `modules/notes_index/router.py` | `POST /api/notes-index/{note_id}`, `DELETE /api/notes-index/{note_id}` |
| `modules/chat/tools.py` | Add `search_knowledge(query)` tool |
| `modules/chat/agent_defs.py` | Add `search_knowledge` to `ALL_TOOLS`, remove note-related instruction from `search_rag_documents` |
| `core/prompt.py` | Add `search_knowledge` usage instruction to `MAIN_ASSISTANT_PROMPT` |
| `tasks.py` | Import `modules.notes_index.tasks` to register with Celery |
| `celery_app.py` | Add `beat_schedule` for 5-minute sync |

### Frontend — `apps/web/`

| File | Change |
|------|--------|
| `src/routes/notes/$id.tsx` | Add `IndexButton` component next to `SaveIndicator`; add `indexStatus` state; call `POST /api/notes-index/{note_id}` |

---

## Data Models

### `note_index` table (PostgreSQL, ai-agent DB)

```sql
CREATE TABLE note_index (
  note_id      TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  indexed_at   TIMESTAMP NOT NULL,
  user_id      TEXT NOT NULL
);
```

### ChromaDB collection: `note_pages`

Collection name: `"note_pages"` (separate from `"documents_v2"`)

Chunk metadata:
```json
{
  "note_id": "abc123",
  "note_title": "Machine Learning Notes",
  "user_id": "user_456",
  "chunk_index": 0
}
```

---

## Key Logic

### TipTap JSON Stripping

Notes are stored as TipTap JSON (`{"type":"doc","content":[...]}`). Before chunking:

1. Try `json.loads(content)`
2. If valid JSON → recursively extract all `text` leaf nodes → join with `\n`
3. If not JSON → use as-is (plain text / markdown)

### Content Hash

```python
import hashlib
def hash_content(title: str, content: str) -> str:
    return hashlib.md5(f"{title}{content}".encode()).hexdigest()
```

### Delete + Insert Upsert

Never update chunks in place. Always:
1. `collection.delete(where={"note_id": note_id})`
2. Re-chunk plain text → embed → `collection.add(...)`

### Celery Beat Sync (5 minutes)

```
sync_notes_task:
  1. SELECT id, title, content, user_id FROM notes   (shared DB)
  2. For each note:
       hash = hash_content(title, content)
       existing = note_index.get(note_id)
       if not existing → index (new note)
       elif existing.hash != hash → re-index (changed)
       else → skip
  3. Cleanup:
       indexed_ids = all note_ids in note_index
       live_ids = all note_ids from notes table
       stale = indexed_ids - live_ids
       for each stale: delete from ChromaDB + note_index
```

---

## `search_knowledge` Tool

Replaces the need for separate `search_notes` and `search_rag_documents` calls when searching user content.

```python
@function_tool
def search_knowledge(query: str, n_results: int = 5) -> str:
    """
    Search across all user knowledge: RAG documents and indexed notes.
    Use this when the user asks about their content, notes, or uploaded documents.

    Args:
        query: The search term or question.
        n_results: Max results per source (default 5).
    """
    doc_results  = search_chunks(query, collection="documents_v2", n=n_results)
    note_results = search_chunks(query, collection="note_pages",   n=n_results)
    # merge, label by source, sort by distance
    ...
```

System prompt addition:
> "When the user asks about their notes, content, or documents → call `search_knowledge`. Do NOT call `search_rag_documents` for this purpose."

Existing `search_rag_documents` remains available for backward compatibility (e.g., filter by specific document_id), but `search_knowledge` is preferred for general queries.

---

## Frontend: Index Button

Location: `routes/notes/$id.tsx`, same fixed-position container as `SaveIndicator`.

States:
- `idle` — "Index" (subtle button, only shown when `saveStatus === 'saved'`)
- `indexing` — "Indexing…" + spinner
- `indexed` — "Indexed ✓" (green, fades after 3s back to idle)
- `error` — "Failed" (red, fades after 3s back to idle)

Button only active when `saveStatus === 'saved'` — prevents indexing stale content.

API call:
```
POST /api/notes-index/{note_id}
Body: { title: string, content: string, user_id: string }
Response: { status: "queued" | "already_indexed" }
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Embedding API down | Celery task retries 3x with 10s delay; button shows "Failed" |
| Note content empty | Skip indexing, do not create note_index entry |
| Chroma delete fails | Log error, still attempt insert (worst case: duplicate chunks, cleaned on next sync) |
| Celery Beat overlaps | Celery `one_at_a_time` lock or idempotent hash check prevents double-index |

---

## Out of Scope

- `note_attachments` collection — not included in `search_knowledge`
- Per-user filtering in search (all notes searchable by the AI regardless of `user_id` — same behavior as `documents_v2` today)
- Real-time index on save (intentionally excluded — 5-min Beat + manual button is sufficient)
