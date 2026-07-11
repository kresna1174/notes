import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Load DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")

# Async engine for SQLite
engine = create_async_engine(DATABASE_URL, echo=True)

# Session factory for async sessions
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Declarative Base for ORM models
class Base(DeclarativeBase):
    pass

# Dependency injection for FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
