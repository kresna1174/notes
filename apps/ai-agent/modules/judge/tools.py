"""Tools exclusive to the judge agent for gathering evaluation context."""

import json
import logging

import httpx
from agents import function_tool, RunContextWrapper

from core.settings import settings

logger = logging.getLogger("ai-agent")


def _web_base() -> str:
    return settings.internal_web_base


@function_tool
async def get_note_content(ctx: RunContextWrapper[dict], note_id: str) -> str:
    """
    Fetch the current content of a note by its ID.
    Use this to verify whether the assistant's answer is grounded in the actual note.

    Args:
        note_id: The UUID of the note to fetch.
    """
    if not note_id or not note_id.strip():
        return json.dumps({"error": True, "message": "note_id is required"})

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{_web_base()}/api/notes/{note_id}")
            if not resp.is_success:
                return json.dumps({"error": True, "message": f"Note not found (HTTP {resp.status_code})"})
            data = resp.json()
            return json.dumps({
                "id": data.get("id"),
                "title": data.get("title"),
                "content": (data.get("content") or "")[:4000],
            })
    except Exception as e:
        logger.warning(f"[judge] get_note_content failed: {e}")
        return json.dumps({"error": True, "message": str(e)})


@function_tool
async def get_session_history(ctx: RunContextWrapper[dict], session_id: str, last_n: int = 6) -> str:
    """
    Retrieve the last N turns of a chat session.
    Use this to understand what the user and assistant have been discussing
    and whether the answer is consistent with the conversation so far.

    Args:
        session_id: The session identifier.
        last_n: Number of recent turns to retrieve (default 6, max 20).
    """
    if not session_id:
        return json.dumps({"error": True, "message": "session_id is required"})

    last_n = min(max(1, last_n), 20)

    try:
        from core.database import engine
        from sqlalchemy import text as sql_text

        async with engine.connect() as conn:
            rows = await conn.execute(
                sql_text(
                    "SELECT message_data FROM agent_messages "
                    "WHERE session_id = :sid ORDER BY created_at DESC LIMIT :n"
                ),
                {"sid": session_id, "n": last_n},
            )
            turns = []
            for row in rows:
                try:
                    msg = json.loads(row[0])
                    role = msg.get("role")
                    if role not in ("user", "assistant"):
                        continue
                    content = msg.get("content", "")
                    if isinstance(content, list):
                        content = " ".join(
                            p.get("text", "") for p in content if isinstance(p, dict)
                        )
                    if content:
                        turns.append({"role": role, "content": content[:500]})
                except Exception:
                    pass
            turns.reverse()

        return json.dumps({"session_id": session_id, "turns": turns})

    except Exception as e:
        logger.warning(f"[judge] get_session_history failed: {e}")
        return json.dumps({"error": True, "message": str(e)})
