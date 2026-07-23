import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from core.database import engine, AsyncSessionLocal
from core.models import UserMemory

logger = logging.getLogger("ai-agent")

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_memory (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_memory_key UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS ix_user_memory_user_id ON user_memory (user_id);
"""

async def ensure_table():
    async with engine.begin() as conn:
        await conn.execute(text(_CREATE_TABLE_SQL))


async def upsert_memory(user_id: str, key: str, value: str) -> None:
    async with engine.begin() as conn:
        stmt = pg_insert(UserMemory).values(
            id=str(uuid.uuid4()),
            user_id=user_id,
            key=key,
            value=value,
            updated_at=datetime.now(timezone.utc),
        ).on_conflict_do_update(
            constraint="uq_user_memory_key",
            set_={"value": value, "updated_at": datetime.now(timezone.utc)},
        )
        await conn.execute(stmt)


async def get_all_memories(user_id: str) -> dict[str, str]:
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            select(UserMemory).where(UserMemory.user_id == user_id)
        )
        return {row.key: row.value for row in rows.scalars()}


async def delete_memory(user_id: str, key: str) -> bool:
    async with engine.begin() as conn:
        result = await conn.execute(
            delete(UserMemory).where(
                UserMemory.user_id == user_id,
                UserMemory.key == key,
            )
        )
        return result.rowcount > 0


def format_memory_for_prompt(memories: dict[str, str]) -> str:
    if not memories:
        return ""
    lines = [f"- {k}: {v}" for k, v in memories.items()]
    return "## USER MEMORY (persistent facts about this user)\n" + "\n".join(lines)
