from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


class DocumentStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Document(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    path: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: DocumentStatus = Field(default=DocumentStatus.PROCESSING)
    total_pages: int = 0


class DocumentPage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    document_id: str = Field(foreign_key="document.id", index=True)
    page_number: int
    path: str
