import hashlib
import json
import logging
import os
from datetime import datetime, timezone

from openai import OpenAI
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


def extract_knowledge_points(title: str, content: str) -> list[str]:
    """
    Extract key knowledge points, facts, and rules from note content using an LLM.
    Returns a list of extracted points, or an empty list if extraction fails.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("notes_index: OPENROUTER_API_KEY not set. Cannot extract knowledge points.")
        return []

    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    model = os.getenv("OPENROUTER_MODEL", "openrouter/google/gemini-3.5-flash")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

    prompt = f"""You are a Knowledge Extraction assistant.
Analyze the following note titled "{title}" and extract a list of granular, independent knowledge points, facts, rules, or questions with answers that this note contains.

Guidelines:
1. Each point must be fully self-contained and descriptive, containing context (e.g., mention names, project names, or specific dates/subjects) so that it can be searched and understood on its own without reading the whole note.
2. Extract the knowledge points in the same language as the note (e.g., if the note is in Indonesian, output Indonesian).
3. Return the list as a JSON array of strings. Do not include markdown code block formatting (like ```json) unless necessary, but to be safe, only return valid JSON.
4. If the note is short or simple, you can extract 1-3 points. For longer notes, extract as many as needed.
5. If there is no extractable knowledge (e.g., random characters or empty text), return an empty JSON array [].

Note Content:
{content}

JSON Response:"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,
        )
        output = response.choices[0].message.content.strip()
        
        # Clean up any potential markdown code blocks
        if output.startswith("```"):
            lines = output.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            output = "\n".join(lines).strip()
            
        data = json.loads(output)
        if isinstance(data, list):
            return [str(item) for item in data if item]
        elif isinstance(data, dict):
            for key in ["knowledge_points", "points", "facts", "questions"]:
                if key in data and isinstance(data[key], list):
                    return [str(item) for item in data[key] if item]
            return [f"{k}: {v}" for k, v in data.items()]
        return []
    except Exception as e:
        logger.error(f"notes_index: Failed to extract knowledge points via LLM: {e}")
        return []


def index_note(note_id: str, note_title: str, note_content: str, user_id: str) -> int:
    """
    Strip, chunk, embed, and upsert note into note_pages ChromaDB collection.
    Updates note_index tracking table. Returns number of chunks indexed (0 = skipped/empty).
    """
    plain_text = strip_tiptap_json(note_content)
    if not plain_text.strip():
        logger.info(f"notes_index: skipping empty note {note_id}")
        return 0

    # Try to extract knowledge points using LLM
    chunks = extract_knowledge_points(note_title, plain_text)
    
    # Fallback to standard chunking if extraction failed or returned no chunks
    if not chunks:
        logger.info(f"notes_index: falling back to raw chunking for note {note_id}")
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
