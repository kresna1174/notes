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
