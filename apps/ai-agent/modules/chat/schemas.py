from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    user_id: str | None = None
    agent: str | None = None  # e.g. "main", "writer", "researcher", "auto"


class ChatAttachment(BaseModel):
    filename: str
    mimeType: str
    filePath: str


class ChatStreamRequest(BaseModel):
    message: str | None = None
    messages: list[dict] | None = None
    session_id: str = "default"
    note_title: str | None = None
    note_content: str | None = None
    user_id: str | None = None
    attachments: list[ChatAttachment] | None = None
    agent: str | None = None  # e.g. "main", "writer", "researcher", "auto"


class SummarizeRequest(BaseModel):
    content: str
    session_id: str = "default"
    user_id: str | None = None


class TagsRequest(BaseModel):
    content: str
    session_id: str = "default"
    user_id: str | None = None


class ApproveRejectRequest(BaseModel):
    session_id: str
    call_id: str
    status: str


class DiagramRequest(BaseModel):
    prompt: str
    note_content: str | None = None
    note_title: str | None = None
