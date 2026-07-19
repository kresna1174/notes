from datetime import datetime, timezone
from sqlmodel import Field, SQLModel


class NoteIndex(SQLModel, table=True):
    __tablename__ = "note_index"

    note_id: str = Field(primary_key=True)
    content_hash: str
    indexed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str = Field(default="")
