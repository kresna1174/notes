"""
Pydantic request/response schemas for the LLM Wiki module.

All JSON-array fields that are stored as strings in the DB are exposed as
proper Python list[str] here, with serialization handled by the methods layer.
"""

from pydantic import BaseModel, Field


class WikiPageCreate(BaseModel):
    """Payload for manually creating a wiki page via the API."""

    slug: str = Field(..., description="URL-safe identifier, e.g. 'entities/project_x'")
    title: str
    category: str = Field(
        ...,
        description="One of: summary, entity, concept, index, log, synthesis",
    )
    content: str = Field(..., description="Markdown content with optional [[WikiLink]] syntax")
    source_note_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class WikiPageUpdate(BaseModel):
    """Payload for updating an existing wiki page. All fields are optional."""

    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    source_note_ids: list[str] | None = None
    backlinks: list[str] | None = None


class WikiPageResponse(BaseModel):
    """Full representation of a wiki page returned by the API."""

    id: str
    slug: str
    title: str
    category: str
    content: str
    source_note_ids: list[str]
    tags: list[str]
    backlinks: list[str]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class WikiSearchResult(BaseModel):
    """A single BM25 search hit from the wiki."""

    slug: str
    title: str
    category: str
    excerpt: str
    score: float


class WikiIngestRequest(BaseModel):
    """Payload for triggering a wiki ingest run for a specific note."""

    note_id: str = Field(..., description="Unique ID of the source note")
    note_title: str
    note_content: str = Field(
        ...,
        description="Full text or HTML content of the note to ingest",
    )
    user_id: str | None = None


class WikiIngestResponse(BaseModel):
    """Response returned after a wiki ingest run completes."""

    status: str  # "completed" | "failed"
    note_id: str
    note_title: str
    pages_created: list[str]
    pages_updated: list[str]
    summary: str
    log_id: str


class WikiIngestLogResponse(BaseModel):
    """Serialized WikiIngestLog for API responses."""

    id: str
    note_id: str
    note_title: str
    pages_created: list[str]
    pages_updated: list[str]
    status: str
    summary: str | None
    created_at: str

    model_config = {"from_attributes": True}


class WikiGraphResponse(BaseModel):
    """Graph payload for wiki visualization (nodes + edges)."""

    nodes: list[dict]
    edges: list[dict]


class WikiLintReport(BaseModel):
    """Health-check report for the wiki produced by the lint endpoint."""

    total_pages: int
    orphan_pages: list[str] = Field(
        default_factory=list,
        description="Pages that are not linked to by any other page",
    )
    missing_link_targets: list[dict] = Field(
        default_factory=list,
        description="[[WikiLinks]] that point to non-existent pages",
    )
    empty_pages: list[str] = Field(
        default_factory=list,
        description="Pages with no content",
    )
    stale_backlinks: list[dict] = Field(
        default_factory=list,
        description="Backlinks recorded on pages that no longer reference the source",
    )
    summary: str
