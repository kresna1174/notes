from datetime import datetime, timezone
import uuid
from sqlalchemy import String, Text, DateTime, Integer, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base

class SubAgentTask(Base):
    __tablename__ = "sub_agent_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    sub_agent_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, running, completed, failed
    input_data: Mapped[str] = mapped_column(Text, nullable=True)
    output_data: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "sub_agent_type": self.sub_agent_type,
            "status": self.status,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class UserMemory(Base):
    """Persistent facts about a user, injected into agent system prompt each session."""
    __tablename__ = "user_memory"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_memory_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AiSkill(Base):
    """Read-only mapping of the ``ai_skills`` table owned by the web app (Drizzle).

    The AI agent never creates or migrates this table — it only reads name +
    description (catalog) and content (loaded on demand via ``load_skill``).
    """
    __tablename__ = "ai_skills"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str | None] = mapped_column(Text, nullable=True)          # populated after Fase 0
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SessionTokenUsage(Base):
    __tablename__ = "session_token_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "model": self.model,
            "created_at": self.created_at.isoformat(),
        }
