from collections.abc import Mapping
from typing import cast

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    n_results: int = Field(default=5, ge=1, le=50)
    document_id: str | None = None


class QueryHit(BaseModel):
    page_id: str
    document_id: str
    document_name: str
    page_number: int
    total_pages: int
    text: str
    distance: float | None = None


class QueryResponse(BaseModel):
    query: str
    hits: list[QueryHit]


def _string_value(value: object, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _int_value(value: object, fallback: int = 0) -> int:
    if value is None:
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def hit_from_chroma(payload: dict[str, object]) -> QueryHit:
    raw_metadata = payload.get("metadata")
    metadata: Mapping[str, object] = (
        cast("Mapping[str, object]", raw_metadata) if isinstance(raw_metadata, dict) else {}
    )
    document_id = _string_value(metadata.get("document_id"))
    page_number = _int_value(metadata.get("page_number"))
    page_id = _string_value(payload.get("id"), f"doc-{document_id}-page-{page_number}")

    return QueryHit(
        page_id=page_id,
        document_id=document_id,
        document_name=_string_value(metadata.get("document_name")),
        page_number=page_number,
        total_pages=_int_value(metadata.get("total_pages")),
        text=_string_value(payload.get("document")),
        distance=_float_or_none(payload.get("distance")),
    )


class ChatResponse(BaseModel):
    query: str
    answer: str
    hits: list[QueryHit]
