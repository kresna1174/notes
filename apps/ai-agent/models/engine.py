import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

def _build_sync_url(url: str) -> str:
    # Strip async drivers, ensure psycopg2
    url = url.replace("+asyncpg", "").replace("+aiosqlite", "")
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1).replace("postgres://", "postgresql+psycopg2://", 1)
    return url

DATABASE_URL = _build_sync_url(
    os.getenv("DATABASE_URL", "postgresql+psycopg2://notes:notes_secret@localhost:5432/notesdb")
)

engine = create_engine(DATABASE_URL, echo=False)

def init_db() -> None:
    SQLModel.metadata.create_all(engine)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
