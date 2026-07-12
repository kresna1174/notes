import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

def build_async_url(url: str) -> str:
    if not url:
        return url
    # Convert postgresql+psycopg2:// or other sync postgresql variants to postgresql+asyncpg://
    if url.startswith("postgresql+"):
        if "://" in url:
            _, rest = url.split("://", 1)
            return f"postgresql+asyncpg://{rest}"
    # Convert postgresql:// or postgres:// to postgresql+asyncpg://
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1).replace("postgres://", "postgresql+asyncpg://", 1)
    # Convert sqlite:// to sqlite+aiosqlite://
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url

DATABASE_URL = build_async_url(
    os.getenv("DATABASE_URL", "postgresql+asyncpg://notes:notes_secret@localhost:5432/notesdb")
)


engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
