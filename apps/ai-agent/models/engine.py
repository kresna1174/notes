from collections.abc import Generator

from sqlmodel import Session, create_engine

from core.settings import settings

DATABASE_PATH = settings.storage_dir / "rag.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
