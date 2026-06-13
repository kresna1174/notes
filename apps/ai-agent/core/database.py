import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# Ambil DATABASE_URL dari environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")

# Setup async engine untuk SQLite
engine = create_async_engine(DATABASE_URL, echo=True)

# Session factory untuk async session
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Declarative Base untuk model
class Base(DeclarativeBase):
    pass

# Dependency injection untuk FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
