from datetime import datetime

from pydantic import BaseModel

from models.database import DocumentStatus


class DocumentMetadata(BaseModel):
    id: str
    name: str
    status: DocumentStatus
    uploaded_at: datetime
    total_pages: int


class DocumentUploadResponse(BaseModel):
    id: str
    name: str
    status: DocumentStatus
    total_pages: int
    uploaded_at: datetime


class PageResponse(BaseModel):
    page_id: str
    document_id: str
    document_name: str
    page_number: int
    total_pages: int
    text: str
