# Notes RAG Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index user notes into ChromaDB `note_pages` collection so the AI can search notes + RAG documents with a single `search_knowledge` tool, with auto-sync every 5 minutes via Celery Beat and a manual "Index" button in the note editor.

**Architecture:** Notes are stripped from TipTap JSON to plain text, chunked, and embedded into a dedicated `note_pages` ChromaDB collection using the same `OpenRouterEmbeddingFunction` pattern as `documents_v2`. A `note_index` PostgreSQL table tracks `content_hash` per note so Celery Beat only re-indexes notes that actually changed.

**Tech Stack:** Python/FastAPI, SQLModel, ChromaDB, Celery + Celery Beat, React/TypeScript, shared PostgreSQL DB (`notesdb`)

## Global Constraints

- Follow SQLModel pattern for DB models (matching `models/database.py`) — use `SQLModel` with `table=True`
- Sync DB access via `models/engine.py` (`Session`, `create_engine`) for Celery tasks and routers
- Async DB access via `core/database.py` (`AsyncSessionLocal`) for FastAPI endpoints only
- ChromaDB embedding: use `OpenRouterEmbeddingFunction` from `utils/chroma.py` — do NOT call `generate_embeddings()` async function in sync tasks
- Celery tasks are always sync functions (no `async def`); wrap async in `asyncio.run()` only if absolutely needed
- All new files in `apps/ai-agent/`
- Frontend file: `apps/web/src/routes/notes/$id.tsx`
- AI agent URL: `http://localhost:8001` (same as other `/api/ai/` calls in frontend)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/ai-agent/utils/chroma.py` | Modify | Add `get_notes_collection()` for `note_pages` |
| `apps/ai-agent/modules/notes_index/__init__.py` | Create | Empty package marker |
| `apps/ai-agent/modules/notes_index/models.py` | Create | `NoteIndex` SQLModel table |
| `apps/ai-agent/modules/notes_index/methods.py` | Create | `strip_tiptap_json`, `hash_content`, `index_note`, `delete_note_index` |
| `apps/ai-agent/modules/notes_index/tasks.py` | Create | `index_note_task`, `sync_notes_task` Celery tasks |
| `apps/ai-agent/modules/notes_index/router.py` | Create | `POST /api/notes-index/{note_id}`, `DELETE /api/notes-index/{note_id}` |
| `apps/ai-agent/modules/chat/tools.py` | Modify | Add `search_knowledge` tool |
| `apps/ai-agent/modules/chat/agent_defs.py` | Modify | Add `search_knowledge` to `ALL_TOOLS` |
| `apps/ai-agent/core/prompt.py` | Modify | Add `search_knowledge` instruction to `MAIN_ASSISTANT_PROMPT` |
| `apps/ai-agent/tasks.py` | Modify | Import `modules.notes_index.tasks` |
| `apps/ai-agent/core/celery_app.py` | Modify | Add `beat_schedule` for 5-minute sync |
| `apps/ai-agent/main.py` | Modify | Register `notes_index` router + model in `lifespan` |
| `apps/web/src/routes/notes/$id.tsx` | Modify | Add `IndexButton` component + `indexStatus` state |

---

### Task 1: Add `note_pages` ChromaDB collection

**Files:**
- Modify: `apps/ai-agent/utils/chroma.py`

**Interfaces:**
- Produces: `get_notes_collection() -> chromadb.Collection` — used by Tasks 3 and 5

- [ ] **Step 1: Add `get_notes_collection` to `utils/chroma.py`**

Open `apps/ai-agent/utils/chroma.py`. After the existing `get_collection()` function, add:

```python
def get_notes_collection():
    emb_fn = OpenRouterEmbeddingFunction(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
    )
    return get_client().get_or_create_collection(
        name="note_pages",
        embedding_function=emb_fn,
    )
```

- [ ] **Step 2: Verify collection is created cleanly**

Start a Python REPL inside `apps/ai-agent/`:
```bash
cd apps/ai-agent
python -c "from utils.chroma import get_notes_collection; c = get_notes_collection(); print(c.name)"
```
Expected output: `note_pages`

- [ ] **Step 3: Commit**

```bash
git add apps/ai-agent/utils/chroma.py
git commit -m "feat(rag): add note_pages ChromaDB collection"
```

---

### Task 2: `NoteIndex` SQLModel + `note_index` table

**Files:**
- Create: `apps/ai-agent/modules/notes_index/__init__.py`
- Create: `apps/ai-agent/modules/notes_index/models.py`
- Modify: `apps/ai-agent/main.py`

**Interfaces:**
- Produces: `NoteIndex` SQLModel — fields: `note_id: str (PK)`, `content_hash: str`, `indexed_at: datetime`, `user_id: str`

- [ ] **Step 1: Create package marker**

```bash
touch apps/ai-agent/modules/notes_index/__init__.py
```

- [ ] **Step 2: Create `models.py`**

Create `apps/ai-agent/modules/notes_index/models.py`:

```python
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class NoteIndex(SQLModel, table=True):
    __tablename__ = "note_index"

    note_id: str = Field(primary_key=True)
    content_hash: str
    indexed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str = Field(default="")
```

- [ ] **Step 3: Register model in `main.py` lifespan so table is auto-created**

In `apps/ai-agent/main.py`, add import after the existing `import modules.wiki.models`:

```python
import modules.notes_index.models  # noqa: F401 — registers NoteIndex with SQLModel.metadata
```

- [ ] **Step 4: Verify table creation**

Start the ai-agent and check logs, or run:
```bash
cd apps/ai-agent
python -c "
from models.engine import engine, init_db
import modules.notes_index.models
init_db()
print('note_index table created')
"
```
Expected: `note_index table created` (no errors)

- [ ] **Step 5: Commit**

```bash
git add apps/ai-agent/modules/notes_index/__init__.py apps/ai-agent/modules/notes_index/models.py apps/ai-agent/main.py
git commit -m "feat(rag): add NoteIndex SQLModel table"
```

---

### Task 3: Core indexing methods

**Files:**
- Create: `apps/ai-agent/modules/notes_index/methods.py`

**Interfaces:**
- Consumes: `get_notes_collection()` from `utils/chroma.py` (Task 1); `NoteIndex` from `modules/notes_index/models.py` (Task 2); `chunk_text` from `modules/rag/methods.py`
- Produces:
  - `strip_tiptap_json(content: str) -> str`
  - `hash_content(title: str, content: str) -> str`
  - `index_note(note_id: str, note_title: str, note_content: str, user_id: str) -> int` — returns chunk count
  - `delete_note_index(note_id: str) -> None`

- [ ] **Step 1: Write the failing tests**

Create `apps/ai-agent/tests/test_notes_index_methods.py`:

```python
import pytest
from modules.notes_index.methods import strip_tiptap_json, hash_content


def test_strip_tiptap_json_extracts_text():
    tiptap = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}'
    result = strip_tiptap_json(tiptap)
    assert "Hello world" in result


def test_strip_tiptap_json_nested():
    tiptap = '{"type":"doc","content":[{"type":"heading","content":[{"type":"text","text":"Title"}]},{"type":"paragraph","content":[{"type":"text","text":"Body text"}]}]}'
    result = strip_tiptap_json(tiptap)
    assert "Title" in result
    assert "Body text" in result


def test_strip_tiptap_json_plain_text_passthrough():
    plain = "This is plain text, not JSON"
    assert strip_tiptap_json(plain) == plain


def test_strip_tiptap_json_empty_doc():
    tiptap = '{"type":"doc","content":[]}'
    result = strip_tiptap_json(tiptap)
    assert result == ""


def test_hash_content_deterministic():
    h1 = hash_content("My Note", "Some content")
    h2 = hash_content("My Note", "Some content")
    assert h1 == h2


def test_hash_content_differs_on_change():
    h1 = hash_content("My Note", "Some content")
    h2 = hash_content("My Note", "Different content")
    assert h1 != h2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ai-agent
python -m pytest tests/test_notes_index_methods.py -v
```
Expected: `ModuleNotFoundError: No module named 'modules.notes_index.methods'`

- [ ] **Step 3: Implement `methods.py`**

Create `apps/ai-agent/modules/notes_index/methods.py`:

```python
import hashlib
import json
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from models.engine import engine
from modules.notes_index.models import NoteIndex
from modules.rag.methods import chunk_text
from utils.chroma import chroma_lock, get_notes_collection

logger = logging.getLogger("ai-agent")


def strip_tiptap_json(content: str) -> str:
    """Extract plain text from TipTap JSON. Returns content as-is if not JSON."""
    if not content:
        return ""
    try:
        doc = json.loads(content)
        texts: list[str] = []
        _extract_text_nodes(doc, texts)
        return "\n".join(texts)
    except (json.JSONDecodeError, TypeError):
        return content


def _extract_text_nodes(node: dict, texts: list[str]) -> None:
    if not isinstance(node, dict):
        return
    if node.get("type") == "text" and "text" in node:
        texts.append(node["text"])
    for child in node.get("content", []):
        _extract_text_nodes(child, texts)


def hash_content(title: str, content: str) -> str:
    return hashlib.md5(f"{title}{content}".encode()).hexdigest()


def index_note(note_id: str, note_title: str, note_content: str, user_id: str) -> int:
    """
    Strip, chunk, embed, and upsert note into note_pages ChromaDB collection.
    Updates note_index tracking table. Returns number of chunks indexed (0 = skipped/empty).
    """
    plain_text = strip_tiptap_json(note_content)
    if not plain_text.strip():
        logger.info(f"notes_index: skipping empty note {note_id}")
        return 0

    chunks = chunk_text(plain_text, chunk_size=800, overlap=150)
    if not chunks:
        return 0

    ids = [f"note-{note_id}-chunk-{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "note_id": note_id,
            "note_title": note_title,
            "user_id": user_id,
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]

    with chroma_lock:
        collection = get_notes_collection()
        collection.delete(where={"note_id": note_id})
        collection.add(ids=ids, documents=chunks, metadatas=metadatas)

    now = datetime.now(timezone.utc)
    content_hash = hash_content(note_title, note_content)

    with Session(engine) as session:
        existing = session.get(NoteIndex, note_id)
        if existing:
            existing.content_hash = content_hash
            existing.indexed_at = now
            existing.user_id = user_id
            session.add(existing)
        else:
            session.add(NoteIndex(
                note_id=note_id,
                content_hash=content_hash,
                indexed_at=now,
                user_id=user_id,
            ))
        session.commit()

    logger.info(f"notes_index: indexed {len(chunks)} chunks for note {note_id}")
    return len(chunks)


def delete_note_index(note_id: str) -> None:
    """Remove note from ChromaDB note_pages collection and note_index table."""
    with chroma_lock:
        collection = get_notes_collection()
        collection.delete(where={"note_id": note_id})

    with Session(engine) as session:
        row = session.get(NoteIndex, note_id)
        if row:
            session.delete(row)
            session.commit()

    logger.info(f"notes_index: deleted index for note {note_id}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/ai-agent
python -m pytest tests/test_notes_index_methods.py -v
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ai-agent/modules/notes_index/methods.py apps/ai-agent/tests/test_notes_index_methods.py
git commit -m "feat(rag): add notes_index core methods with tests"
```

---

### Task 4: Celery tasks — manual trigger + Beat auto-sync

**Files:**
- Create: `apps/ai-agent/modules/notes_index/tasks.py`
- Modify: `apps/ai-agent/tasks.py`
- Modify: `apps/ai-agent/core/celery_app.py`

**Interfaces:**
- Consumes: `index_note`, `delete_note_index`, `hash_content`, `NoteIndex` (Task 3)
- Produces:
  - `index_note_task(note_id, note_title, note_content, user_id)` — Celery task
  - `sync_notes_task()` — Celery Beat periodic task

- [ ] **Step 1: Create `tasks.py`**

Create `apps/ai-agent/modules/notes_index/tasks.py`:

```python
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select, col

from core.celery_app import celery_app
from models.engine import engine
from modules.notes_index.methods import (
    delete_note_index,
    hash_content,
    index_note,
)
from modules.notes_index.models import NoteIndex

logger = logging.getLogger("ai-agent")


@celery_app.task(
    name="modules.notes_index.tasks.index_note_task",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def index_note_task(self, note_id: str, note_title: str, note_content: str, user_id: str) -> dict:
    """Celery task: index a single note into ChromaDB note_pages."""
    try:
        count = index_note(note_id, note_title, note_content, user_id)
        return {"note_id": note_id, "chunks": count, "status": "ok"}
    except Exception as exc:
        logger.error(f"notes_index: index_note_task failed for {note_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(name="modules.notes_index.tasks.sync_notes_task")
def sync_notes_task() -> dict:
    """
    Celery Beat task: sync all notes from the shared PostgreSQL DB into ChromaDB.
    Uses content hash to skip unchanged notes. Cleans up deleted notes.
    Runs every 5 minutes.
    """
    from sqlalchemy import text

    stats = {"indexed": 0, "skipped": 0, "deleted": 0, "errors": 0}

    with Session(engine) as session:
        # Fetch all live notes from shared DB
        rows = session.exec(
            text("SELECT id, title, content, user_id FROM notes")
        ).fetchall()

        live_ids = set()
        for row in rows:
            note_id, title, content, user_id = row
            live_ids.add(note_id)
            new_hash = hash_content(title or "", content or "")

            existing = session.get(NoteIndex, note_id)
            if existing and existing.content_hash == new_hash:
                stats["skipped"] += 1
                continue

            try:
                index_note(note_id, title or "", content or "", user_id or "")
                stats["indexed"] += 1
            except Exception as e:
                logger.error(f"notes_index: sync failed for {note_id}: {e}")
                stats["errors"] += 1

        # Cleanup stale entries
        indexed_rows = session.exec(select(NoteIndex)).all()
        for row in indexed_rows:
            if row.note_id not in live_ids:
                try:
                    delete_note_index(row.note_id)
                    stats["deleted"] += 1
                except Exception as e:
                    logger.error(f"notes_index: cleanup failed for {row.note_id}: {e}")

    logger.info(f"notes_index: sync complete — {stats}")
    return stats
```

- [ ] **Step 2: Register task in `apps/ai-agent/tasks.py`**

Add at the bottom of `apps/ai-agent/tasks.py`, after the existing import:

```python
# Explicitly import notes_index tasks to register them with the Celery worker
import modules.notes_index.tasks
```

- [ ] **Step 3: Add Celery Beat schedule to `core/celery_app.py`**

Add `beat_schedule` to the `celery_app.conf.update(...)` call:

```python
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "sync-notes-every-5-minutes": {
            "task": "modules.notes_index.tasks.sync_notes_task",
            "schedule": 300.0,  # seconds
        },
    },
)
```

- [ ] **Step 4: Verify task registers**

```bash
cd apps/ai-agent
python -c "
from core.celery_app import celery_app
import tasks
import modules.notes_index.tasks
print([t for t in celery_app.tasks if 'notes_index' in t])
"
```
Expected: `['modules.notes_index.tasks.index_note_task', 'modules.notes_index.tasks.sync_notes_task']`

- [ ] **Step 5: Commit**

```bash
git add apps/ai-agent/modules/notes_index/tasks.py apps/ai-agent/tasks.py apps/ai-agent/core/celery_app.py
git commit -m "feat(rag): add Celery tasks for note indexing and 5-min Beat sync"
```

---

### Task 5: FastAPI router — manual index endpoint

**Files:**
- Create: `apps/ai-agent/modules/notes_index/router.py`
- Modify: `apps/ai-agent/main.py`

**Interfaces:**
- Consumes: `index_note_task` from `modules/notes_index/tasks.py` (Task 4); `NoteIndex` from `modules/notes_index/models.py` (Task 2); `hash_content` from `modules/notes_index/methods.py` (Task 3)
- Produces:
  - `POST /api/notes-index/{note_id}` → `{ "status": "queued" | "already_indexed" }`
  - `DELETE /api/notes-index/{note_id}` → `{ "status": "deleted" }`

- [ ] **Step 1: Create `router.py`**

Create `apps/ai-agent/modules/notes_index/router.py`:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from models.engine import engine
from modules.notes_index.methods import delete_note_index, hash_content
from modules.notes_index.models import NoteIndex
from modules.notes_index.tasks import index_note_task

router = APIRouter(prefix="/api/notes-index", tags=["notes-index"])


class IndexNoteRequest(BaseModel):
    title: str
    content: str
    user_id: str = ""


@router.post("/{note_id}")
def trigger_index_note(note_id: str, body: IndexNoteRequest):
    """
    Manually trigger indexing of a single note.
    Returns 'already_indexed' if content hash unchanged.
    """
    with Session(engine) as session:
        existing = session.get(NoteIndex, note_id)
        new_hash = hash_content(body.title, body.content)
        if existing and existing.content_hash == new_hash:
            return {"status": "already_indexed"}

    index_note_task.delay(note_id, body.title, body.content, body.user_id)
    return {"status": "queued"}


@router.delete("/{note_id}")
def remove_note_index(note_id: str):
    """Remove a note from the RAG index."""
    delete_note_index(note_id)
    return {"status": "deleted"}
```

- [ ] **Step 2: Register router in `main.py`**

In `apps/ai-agent/main.py`, add import with existing router imports:

```python
from modules.notes_index.router import router as notes_index_router
```

And register after existing routers:

```python
app.include_router(notes_index_router)
```

- [ ] **Step 3: Verify endpoint appears in API docs**

Start ai-agent and open `http://localhost:8001/docs` — should see `POST /api/notes-index/{note_id}` and `DELETE /api/notes-index/{note_id}` under `notes-index` tag.

- [ ] **Step 4: Test endpoint manually**

```bash
curl -X POST http://localhost:8001/api/notes-index/test-note-123 \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Note", "content": "Hello world content", "user_id": "user1"}'
```
Expected: `{"status": "queued"}`

Call again immediately:
```bash
curl -X POST http://localhost:8001/api/notes-index/test-note-123 \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Note", "content": "Hello world content", "user_id": "user1"}'
```
Expected: `{"status": "already_indexed"}`

- [ ] **Step 5: Commit**

```bash
git add apps/ai-agent/modules/notes_index/router.py apps/ai-agent/main.py
git commit -m "feat(rag): add notes-index FastAPI router"
```

---

### Task 6: `search_knowledge` AI tool

**Files:**
- Modify: `apps/ai-agent/modules/chat/tools.py`
- Modify: `apps/ai-agent/modules/chat/agent_defs.py`
- Modify: `apps/ai-agent/core/prompt.py`

**Interfaces:**
- Consumes: `get_collection()`, `get_notes_collection()` from `utils/chroma.py` (Task 1); `chroma_lock` from `utils/chroma.py`
- Produces: `search_knowledge(query: str, n_results: int = 5) -> str` — `@function_tool`

- [ ] **Step 1: Add `search_knowledge` to `tools.py`**

In `apps/ai-agent/modules/chat/tools.py`, add after the existing `search_rag_documents` function:

```python
@function_tool
def search_knowledge(query: str, n_results: int = 5) -> str:
    """
    Search across all user knowledge: uploaded RAG documents and indexed notes.
    Always use this when the user asks about their content, notes, or documents.
    Returns merged results labelled by source (document or note).

    Args:
        query: The search term or question.
        n_results: Max results per source (default 5).
    """
    from utils.chroma import chroma_lock, get_collection, get_notes_collection

    output = []

    # Search RAG documents (documents_v2)
    try:
        with chroma_lock:
            doc_raw = get_collection().query(
                query_texts=[query],
                n_results=n_results,
                include=["documents", "metadatas", "distances"],
            )
        doc_docs = (doc_raw.get("documents") or [[]])[0]
        doc_metas = (doc_raw.get("metadatas") or [[]])[0]
        doc_dists = (doc_raw.get("distances") or [[]])[0]
        for doc, meta, dist in zip(doc_docs, doc_metas, doc_dists):
            output.append(
                f"[Source: Document — {meta.get('document_name', 'Unknown')}, "
                f"Page {meta.get('page_number', 0) + 1}, Distance: {dist:.4f}]\n{doc}"
            )
    except Exception as e:
        output.append(f"[Document search error: {e}]")

    # Search indexed notes (note_pages)
    try:
        with chroma_lock:
            note_raw = get_notes_collection().query(
                query_texts=[query],
                n_results=n_results,
                include=["documents", "metadatas", "distances"],
            )
        note_docs = (note_raw.get("documents") or [[]])[0]
        note_metas = (note_raw.get("metadatas") or [[]])[0]
        note_dists = (note_raw.get("distances") or [[]])[0]
        for doc, meta, dist in zip(note_docs, note_metas, note_dists):
            output.append(
                f"[Source: Note — \"{meta.get('note_title', 'Untitled')}\", "
                f"Distance: {dist:.4f}]\n{doc}"
            )
    except Exception as e:
        output.append(f"[Note search error: {e}]")

    if not output:
        return "No relevant results found in documents or notes."

    return "\n\n---\n\n".join(output)
```

- [ ] **Step 2: Add `search_knowledge` to `agent_defs.py`**

In `apps/ai-agent/modules/chat/agent_defs.py`:

Import `search_knowledge`:
```python
from modules.chat.tools import (
    write_notes, update_note_direct,
    search_web, extract_web, crawl_web,
    execute_python_code, find_web_photos, find_youtube_videos,
    list_rag_documents, search_rag_documents,
    query_wiki, ingest_note_to_wiki, read_wiki_index,
    search_knowledge,
)
```

Add to `ALL_TOOLS`:
```python
ALL_TOOLS = NOTE_TOOLS + WEB_TOOLS + RAG_TOOLS + WIKI_TOOLS + [execute_python_code, search_knowledge]
```

- [ ] **Step 3: Update `MAIN_ASSISTANT_PROMPT` in `core/prompt.py`**

In `_TOOL_CONTEXT`, add after the RAG Tools section:

```python
### Knowledge Search Tool
- `search_knowledge(query, n_results=5)` — Search across ALL user knowledge simultaneously: uploaded RAG documents AND indexed notes. **Always use this** when the user asks about their content, past notes, or uploaded documents. Do NOT use `search_rag_documents` for general queries — use `search_knowledge` instead.
```

In `MAIN_ASSISTANT_PROMPT` COMMON WORKFLOWS section, add:
```python
- "What did I write about [X]?" / "Find in my notes" / "Search my documents" → `search_knowledge`.
```

- [ ] **Step 4: Verify `search_knowledge` is available to agent**

```bash
cd apps/ai-agent
python -c "
from modules.chat.agent_defs import parent_agent
tool_names = [t.name for t in parent_agent.tools]
print('search_knowledge' in tool_names, tool_names)
"
```
Expected: `True` in output

- [ ] **Step 5: Commit**

```bash
git add apps/ai-agent/modules/chat/tools.py apps/ai-agent/modules/chat/agent_defs.py apps/ai-agent/core/prompt.py
git commit -m "feat(rag): add search_knowledge unified tool for notes + documents"
```

---

### Task 7: Frontend — `IndexButton` in note editor

**Files:**
- Modify: `apps/web/src/routes/notes/$id.tsx`

**Interfaces:**
- Consumes: `POST /api/ai/notes-index/{note_id}` (proxied from web to ai-agent; check existing proxy config)
- Produces: `IndexButton` component inline in `$id.tsx`; `indexStatus` state on `NotePageComponent`

- [ ] **Step 1: Check proxy config for ai-agent URL**

```bash
grep -n "ai-agent\|8001\|proxy\|rewrite" apps/web/vite.config.ts apps/web/next.config.* 2>/dev/null | head -10
```

Note the proxy path prefix used for ai-agent calls (likely `/api/ai/`).

- [ ] **Step 2: Add `IndexButton` component and state to `$id.tsx`**

In `apps/web/src/routes/notes/$id.tsx`, add the `Database` icon import to the existing lucide import line:

```typescript
import { Check, Loader2, Circle, PanelLeftClose, PanelLeftOpen, Database } from 'lucide-react'
```

Add `IndexStatus` type after `SaveStatus`:

```typescript
type IndexStatus = 'idle' | 'indexing' | 'indexed' | 'error'
```

Add `IndexButton` component after the `SaveIndicator` function:

```typescript
function IndexButton({
  noteId,
  noteTitle,
  noteContent,
  saveStatus,
  sidebarOpen,
  isMobile,
  historyOpen,
}: {
  noteId: string
  noteTitle: string
  noteContent: string
  saveStatus: SaveStatus
  sidebarOpen: boolean
  isMobile: boolean
  historyOpen: boolean
}) {
  const [status, setStatus] = useState<IndexStatus>('idle')

  if (isMobile && sidebarOpen) return null

  const bottomOffset = historyOpen ? 280 + 12 : 20
  const isDisabled = saveStatus !== 'saved' || status === 'indexing'

  const handleIndex = async () => {
    if (isDisabled) return
    setStatus('indexing')
    try {
      const res = await fetch(`/api/ai/notes-index/${noteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteTitle, content: noteContent, user_id: '' }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('indexed')
    } catch {
      setStatus('error')
    } finally {
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const color =
    status === 'indexed' ? '#22c55e' :
    status === 'error' ? '#ef4444' :
    isDisabled ? 'var(--fg-subtle)' :
    'var(--fg-muted)'

  return (
    <div
      onClick={handleIndex}
      title={
        saveStatus !== 'saved' ? 'Save the note first before indexing' :
        status === 'indexing' ? 'Indexing…' :
        status === 'indexed' ? 'Indexed to RAG ✓' :
        status === 'error' ? 'Indexing failed — try again' :
        'Index this note to RAG search'
      }
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        right: sidebarOpen ? 404 + 120 : 24 + 120,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '0.75rem',
        fontFamily: 'var(--font-body)',
        color,
        background: 'var(--save-bg)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '5px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'right 0.2s ease, bottom 0.2s ease, color 0.2s',
        cursor: isDisabled ? 'default' : 'pointer',
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {status === 'indexing' ? (
        <><Loader2 size={12} className="animate-spin" /> Indexing…</>
      ) : status === 'indexed' ? (
        <><Check size={12} strokeWidth={2.5} /> Indexed</>
      ) : status === 'error' ? (
        <><Database size={12} /> Failed</>
      ) : (
        <><Database size={12} /> Index</>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Render `IndexButton` in the page**

In `NotePageComponent`, find the existing `SaveIndicator` render line (around line 266):

```tsx
{note && isContentVisible && <SaveIndicator status={saveStatus} sidebarOpen={chatOpen} isMobile={isMobile} historyOpen={historyOpen} />}
```

Replace with:

```tsx
{note && isContentVisible && (
  <>
    <SaveIndicator status={saveStatus} sidebarOpen={chatOpen} isMobile={isMobile} historyOpen={historyOpen} />
    <IndexButton
      noteId={note.id}
      noteTitle={note.title}
      noteContent={note.content}
      saveStatus={saveStatus}
      sidebarOpen={chatOpen}
      isMobile={isMobile}
      historyOpen={historyOpen}
    />
  </>
)}
```

- [ ] **Step 4: Check proxy path and fix URL if needed**

Run the dev server and check the browser network tab when clicking Index. If getting 404, find the correct ai-agent proxy prefix:

```bash
grep -n "proxy\|8001\|ai-agent" apps/web/vite.config.ts 2>/dev/null || grep -rn "proxy\|8001" apps/web/src/modules/shared/ragApi.ts 2>/dev/null | head -5
```

Adjust the fetch URL in `handleIndex` to match the actual proxy prefix.

- [ ] **Step 5: Manual test**

1. Open any note
2. Make sure it shows "Saved"
3. Click "Index" button — should show "Indexing…" then "Indexed ✓" (green, fades after 3s)
4. Click again immediately — returns instantly as `already_indexed`, shows "Indexed ✓"
5. Make an edit → button should be disabled (note is in "Unsaved" state)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/notes/\$id.tsx
git commit -m "feat(rag): add Index button to note editor next to SaveIndicator"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| ChromaDB `note_pages` collection | Task 1 |
| `note_index` tracking table | Task 2 |
| `strip_tiptap_json`, `hash_content`, `index_note`, `delete_note_index` | Task 3 |
| `index_note_task` Celery task (manual trigger) | Task 4 |
| `sync_notes_task` Celery Beat 5-min periodic | Task 4 |
| `POST /api/notes-index/{note_id}` | Task 5 |
| `DELETE /api/notes-index/{note_id}` | Task 5 |
| `search_knowledge` tool | Task 6 |
| `search_knowledge` in `ALL_TOOLS` + prompt | Task 6 |
| `IndexButton` in `$id.tsx` next to `SaveIndicator` | Task 7 |
| Button states: idle/indexing/indexed/error | Task 7 |
| Button disabled when `saveStatus !== 'saved'` | Task 7 |

**Placeholder scan:** None found.

**Type consistency:**
- `index_note(note_id: str, note_title: str, note_content: str, user_id: str) -> int` — used in Tasks 3, 4, 5 consistently
- `delete_note_index(note_id: str) -> None` — used in Tasks 3, 4, 5 consistently
- `hash_content(title: str, content: str) -> str` — used in Tasks 3, 4, 5 consistently
- `get_notes_collection()` — defined Task 1, used Tasks 3, 6 consistently
