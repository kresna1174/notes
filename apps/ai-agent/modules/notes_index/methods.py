import hashlib
import json
import logging
from datetime import datetime, timezone

from sqlmodel import Session

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
    for child in (node.get("content") or []):
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
