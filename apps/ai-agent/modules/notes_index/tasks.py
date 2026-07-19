import logging

from sqlalchemy import text
from sqlmodel import Session, select

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
                    stats["errors"] += 1

    logger.info(f"notes_index: sync complete — {stats}")
    return stats
