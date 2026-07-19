"""
FastAPI router for the LLM Wiki module.

Endpoints:
  GET    /api/wiki/pages              — list all pages
  GET    /api/wiki/pages/{slug:path}  — get a specific page by slug
  PUT    /api/wiki/pages/{slug:path}  — manually update a page
  DELETE /api/wiki/pages/{slug:path}  — delete a page
  GET    /api/wiki/index              — structured index grouped by category
  GET    /api/wiki/log                — recent 50 ingest log entries
  GET    /api/wiki/graph              — nodes + edges for graph visualization
  GET    /api/wiki/search             — BM25 full-text search (?q=...)
  POST   /api/wiki/ingest             — trigger WikiIngestAgent for a note
  POST   /api/wiki/lint               — run wiki health-check with WikiLintAgent
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from agents import Runner

from core.database import get_db
from modules.wiki import methods as wiki_methods
from modules.wiki.models import WikiPage, WikiIngestLog
from modules.wiki.schema import (
    WikiPageCreate,
    WikiPageUpdate,
    WikiPageResponse,
    WikiSearchResult,
    WikiIngestRequest,
    WikiIngestResponse,
    WikiIngestLogResponse,
    WikiGraphResponse,
    WikiLintReport,
)
from modules.wiki.agent import wiki_ingest_agent, wiki_lint_agent

logger = logging.getLogger("ai-agent")

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


# ── Helper: convert ORM → response schema ───────────────────────────────────

def _page_to_response(page: WikiPage) -> WikiPageResponse:
    data = page.to_dict()
    return WikiPageResponse(**data)


def _log_to_response(log: WikiIngestLog) -> WikiIngestLogResponse:
    data = log.to_dict()
    return WikiIngestLogResponse(**data)


# ── GET /api/wiki/pages ──────────────────────────────────────────────────────

@router.get(
    "/pages",
    response_model=list[WikiPageResponse],
    summary="List all wiki pages",
)
async def list_wiki_pages(
    db: AsyncSession = Depends(get_db),
) -> list[WikiPageResponse]:
    """Return all wiki pages ordered by category then title."""
    pages = await wiki_methods.get_all_wiki_pages(db)
    return [_page_to_response(p) for p in pages]


# ── GET /api/wiki/pages/{slug} ───────────────────────────────────────────────

@router.get(
    "/pages/{slug:path}",
    response_model=WikiPageResponse,
    summary="Get a wiki page by slug",
)
async def get_wiki_page(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> WikiPageResponse:
    """Return a single wiki page by its slug (supports path slugs like 'entities/openai')."""
    page = await wiki_methods.get_wiki_page_by_slug(db, slug)
    if page is None:
        raise HTTPException(status_code=404, detail=f"Wiki page '{slug}' not found")
    return _page_to_response(page)


# ── PUT /api/wiki/pages/{slug} ───────────────────────────────────────────────

@router.put(
    "/pages/{slug:path}",
    response_model=WikiPageResponse,
    summary="Manually update a wiki page",
)
async def update_wiki_page(
    slug: str,
    payload: WikiPageUpdate,
    db: AsyncSession = Depends(get_db),
) -> WikiPageResponse:
    """Update one or more fields on an existing wiki page.

    All fields are optional — only provided (non-null) fields are written.
    """
    page = await wiki_methods.update_wiki_page(
        db,
        slug=slug,
        content=payload.content,
        title=payload.title,
        tags=payload.tags,
        source_note_ids=payload.source_note_ids,
        backlinks=payload.backlinks,
    )
    if page is None:
        raise HTTPException(status_code=404, detail=f"Wiki page '{slug}' not found")
    return _page_to_response(page)


# ── DELETE /api/wiki/pages/{slug} ────────────────────────────────────────────

@router.delete(
    "/pages/{slug:path}",
    status_code=204,
    summary="Delete a wiki page",
)
async def delete_wiki_page(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a wiki page by slug."""
    deleted = await wiki_methods.delete_wiki_page(db, slug)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Wiki page '{slug}' not found")


# ── GET /api/wiki/index ──────────────────────────────────────────────────────

@router.get(
    "/index",
    response_model=dict,
    summary="Get wiki index grouped by category",
)
async def get_wiki_index(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all wiki pages as a dict keyed by category.

    Shape: ``{"entity": [{"slug": ..., "title": ..., "tags": [...]}], ...}``
    """
    return await wiki_methods.get_wiki_index(db)


# ── GET /api/wiki/log ────────────────────────────────────────────────────────

@router.get(
    "/log",
    response_model=list[WikiIngestLogResponse],
    summary="Get recent wiki ingest logs",
)
async def get_wiki_log(
    db: AsyncSession = Depends(get_db),
) -> list[WikiIngestLogResponse]:
    """Return the 50 most recent wiki ingest log entries (newest first)."""
    logs = await wiki_methods.get_wiki_log(db)
    return [_log_to_response(log) for log in logs]


# ── GET /api/wiki/graph ──────────────────────────────────────────────────────

@router.get(
    "/graph",
    response_model=WikiGraphResponse,
    summary="Get wiki graph for visualization",
)
async def get_wiki_graph(
    db: AsyncSession = Depends(get_db),
) -> WikiGraphResponse:
    """Return nodes and edges derived from [[WikiLink]] references for graph visualisation."""
    graph = await wiki_methods.get_wiki_graph(db)
    return WikiGraphResponse(**graph)


# ── GET /api/wiki/search ─────────────────────────────────────────────────────

@router.get(
    "/search",
    response_model=list[WikiSearchResult],
    summary="Full-text search the wiki",
)
async def search_wiki(
    q: str = Query(..., min_length=1, description="Search query"),
    db: AsyncSession = Depends(get_db),
) -> list[WikiSearchResult]:
    """BM25 search across all wiki page titles and content.

    Returns results ordered by relevance score (descending).
    """
    results = await wiki_methods.search_wiki_pages(db, q)
    return [WikiSearchResult(**r) for r in results]


# ── POST /api/wiki/ingest ────────────────────────────────────────────────────

@router.post(
    "/ingest",
    response_model=WikiIngestResponse,
    summary="Trigger wiki ingest for a note",
)
async def ingest_note(
    payload: WikiIngestRequest,
    db: AsyncSession = Depends(get_db),
) -> WikiIngestResponse:
    """Run the WikiIngestAgent on a note and update the wiki.

    The agent reads the wiki index, then creates/updates summary, entity, and
    concept pages before logging what it did.  The endpoint blocks until the
    agent completes (typically 10-30 seconds depending on note size and LLM
    latency).
    """
    agent_input = (
        f"Ingest the following note into the wiki.\n\n"
        f"**Note ID:** {payload.note_id}\n"
        f"**Note Title:** {payload.note_title}\n\n"
        f"## Note Content\n\n{payload.note_content}"
    )

    context: dict = {
        "note_id": payload.note_id,
        "note_title": payload.note_title,
        "user_id": payload.user_id,
    }

    try:
        result = await Runner.run(
            wiki_ingest_agent,
            agent_input,
            context=context,
            max_turns=30,
        )
        agent_summary = result.final_output or "Wiki ingest completed."
    except Exception as exc:
        logger.error(f"WikiIngestAgent failed for note_id={payload.note_id}: {exc}")
        # Record a failed log entry
        log = await wiki_methods.create_wiki_ingest_log(
            db,
            note_id=payload.note_id,
            note_title=payload.note_title,
            pages_created=[],
            pages_updated=[],
            status="failed",
            summary=str(exc),
        )
        return WikiIngestResponse(
            status="failed",
            note_id=payload.note_id,
            note_title=payload.note_title,
            pages_created=[],
            pages_updated=[],
            summary=str(exc),
            log_id=log.id,
        )

    # Retrieve the latest ingest log created by the agent for this note
    recent_logs = await wiki_methods.get_wiki_log(db)
    matching_log = next(
        (lg for lg in recent_logs if lg.note_id == payload.note_id),
        None,
    )

    pages_created: list[str] = []
    pages_updated: list[str] = []
    log_id = ""

    if matching_log:
        pages_created = json.loads(matching_log.pages_created or "[]")
        pages_updated = json.loads(matching_log.pages_updated or "[]")
        log_id = matching_log.id
    else:
        # Agent may have skipped append_to_wiki_log — create a fallback entry
        fallback_log = await wiki_methods.create_wiki_ingest_log(
            db,
            note_id=payload.note_id,
            note_title=payload.note_title,
            pages_created=[],
            pages_updated=[],
            status="completed",
            summary=agent_summary,
        )
        log_id = fallback_log.id

    return WikiIngestResponse(
        status="completed",
        note_id=payload.note_id,
        note_title=payload.note_title,
        pages_created=pages_created,
        pages_updated=pages_updated,
        summary=agent_summary,
        log_id=log_id,
    )


# ── POST /api/wiki/lint ──────────────────────────────────────────────────────

@router.post(
    "/lint",
    response_model=WikiLintReport,
    summary="Run wiki health check",
)
async def lint_wiki(
    db: AsyncSession = Depends(get_db),
) -> WikiLintReport:
    """Run the WikiLintAgent to detect orphan pages, broken links, and other issues.

    The lint agent reads the wiki and returns a structured health report.
    This endpoint also performs its own structural analysis for accuracy.
    """
    # ── Structural analysis (fast, deterministic) ────────────────────────────
    pages = await wiki_methods.get_all_wiki_pages(db)
    total_pages = len(pages)

    if total_pages == 0:
        return WikiLintReport(
            total_pages=0,
            summary="Wiki is empty — no pages to lint.",
        )

    slug_set = {p.slug for p in pages}

    # Compute inbound link counts
    inbound: dict[str, int] = {p.slug: 0 for p in pages}
    missing_targets: list[dict] = []
    stale_backlinks: list[dict] = []

    import re as _re
    _WIKI_LINK_RE = _re.compile(r"\[\[([^\[\]]+?)\]\]")

    for page in pages:
        targets = [m.group(1).strip().split('|')[0].strip() for m in _WIKI_LINK_RE.finditer(page.content)]
        for target in targets:
            if target in slug_set:
                inbound[target] = inbound.get(target, 0) + 1
            else:
                missing_targets.append({"source": page.slug, "target": target})

    # Orphan pages: no inbound links from other pages AND not a root/index page
    orphans = [
        slug for slug, count in inbound.items()
        if count == 0 and not slug.startswith("index")
    ]

    # Empty pages
    empty_pages = [p.slug for p in pages if len((p.content or "").strip()) < 20]

    # Stale backlinks: check that each recorded backlink actually links back
    for page in pages:
        recorded = json.loads(page.backlinks or "[]")
        for backlink_slug in recorded:
            # Find the source page
            source_page = next((p for p in pages if p.slug == backlink_slug), None)
            if source_page is None:
                stale_backlinks.append({"page": page.slug, "stale_backlink": backlink_slug})
                continue
            # Verify the source page actually links to this page
            refs = [m.group(1).strip().split('|')[0].strip() for m in _WIKI_LINK_RE.finditer(source_page.content)]
            if page.slug not in refs:
                stale_backlinks.append({"page": page.slug, "stale_backlink": backlink_slug})

    summary_parts = [
        f"Total pages: {total_pages}.",
        f"Orphan pages: {len(orphans)}.",
        f"Missing link targets: {len(missing_targets)}.",
        f"Empty pages: {len(empty_pages)}.",
        f"Stale backlinks: {len(stale_backlinks)}.",
    ]
    if not orphans and not missing_targets and not empty_pages and not stale_backlinks:
        summary_parts.append("Wiki is in good health.")

    return WikiLintReport(
        total_pages=total_pages,
        orphan_pages=orphans,
        missing_link_targets=missing_targets,
        empty_pages=empty_pages,
        stale_backlinks=stale_backlinks,
        summary=" ".join(summary_parts),
    )
