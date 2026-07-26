from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from core.celery_app import celery_app
from models.engine import engine
from modules.notes_index.methods import delete_note_index, hash_content
from modules.notes_index.models import NoteIndex
from modules.notes_index.tasks import index_note_task

router = APIRouter(prefix="/api/notes-index", tags=["notes-index"])


class IndexNoteRequest(BaseModel):
    title: str
    content: str
    user_id: str = ""


@router.get("")
def list_indexed_notes():
    """Return all indexed note_ids."""
    with Session(engine) as session:
        rows = session.exec(select(NoteIndex.note_id)).all()
    return {"note_ids": list(rows)}


@router.post("/{note_id}")
def trigger_index_note(note_id: str, body: IndexNoteRequest):
    """
    Manually trigger indexing of a single note.
    Returns 'already_indexed' if content hash unchanged,
    otherwise queues a Celery task and returns task_id for polling.
    """
    with Session(engine) as session:
        existing = session.get(NoteIndex, note_id)
        new_hash = hash_content(body.title, body.content)
        if existing and existing.content_hash == new_hash:
            return {"status": "already_indexed"}

    task = index_note_task.delay(note_id, body.title, body.content, body.user_id)
    return {"status": "queued", "task_id": task.id}


@router.get("/task-status/{task_id}")
def get_index_task_status(task_id: str):
    """
    Poll the status of a Celery indexing task by its task_id.
    Returns state: PENDING | STARTED | SUCCESS | FAILURE | RETRY
    """
    result = celery_app.AsyncResult(task_id)
    state = result.state

    if state == "FAILURE":
        return {
            "state": state,
            "error": str(result.info) if result.info else "Unknown error",
        }

    if state == "SUCCESS":
        return {
            "state": state,
            "result": result.result,
        }

    return {"state": state}


@router.delete("/{note_id}")
def remove_note_index(note_id: str):
    """Remove a note from the RAG index."""
    delete_note_index(note_id)
    return {"status": "deleted"}
