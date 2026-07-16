"""
SQLAlchemy ORM models for the LLM Wiki module.

Tables:
  - wiki_pages: Persistent wiki pages generated and maintained by the WikiIngestAgent.
  - wiki_ingest_logs: Audit log of every note ingestion run.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class WikiPage(Base):
    """A single wiki page in the Mindspace knowledge wiki.

    Content is stored as Markdown text. JSON arrays (source_note_ids, tags,
    backlinks) are stored as serialized JSON strings so we avoid a separate
    join table while staying compatible with SQLite/PostgreSQL.
    """

    __tablename__ = "wiki_pages"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    slug: Mapped[str] = mapped_column(
        String(500),
        unique=True,
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    # summary | entity | concept | index | log | synthesis
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # JSON-serialised list[str] of note IDs that contributed to this page
    source_note_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # JSON-serialised list[str] of tags
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # JSON-serialised list[str] of slugs that link TO this page
    backlinks: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    def to_dict(self) -> dict:
        import json

        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "category": self.category,
            "content": self.content,
            "source_note_ids": json.loads(self.source_note_ids or "[]"),
            "tags": json.loads(self.tags or "[]"),
            "backlinks": json.loads(self.backlinks or "[]"),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class WikiIngestLog(Base):
    """Audit log entry created after every wiki ingest run."""

    __tablename__ = "wiki_ingest_logs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    note_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    note_title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    # JSON-serialised list[str] of wiki slugs created in this run
    pages_created: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # JSON-serialised list[str] of wiki slugs updated in this run
    pages_updated: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    # "completed" | "failed"
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    def to_dict(self) -> dict:
        import json

        return {
            "id": self.id,
            "note_id": self.note_id,
            "note_title": self.note_title,
            "pages_created": json.loads(self.pages_created or "[]"),
            "pages_updated": json.loads(self.pages_updated or "[]"),
            "status": self.status,
            "summary": self.summary,
            "created_at": self.created_at.isoformat(),
        }
