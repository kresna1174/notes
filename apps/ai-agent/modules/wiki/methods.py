"""
Core database operations (CRUD) for the LLM Wiki module.

All functions accept an AsyncSession and return model instances or primitives.
JSON list fields (source_note_ids, tags, backlinks, pages_created, pages_updated)
are serialized/deserialized transparently by these helpers so callers always
work with Python lists.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from modules.wiki.models import WikiPage, WikiIngestLog
from modules.rag.methods import BM25Retriever

logger = logging.getLogger("ai-agent")


# ── Internal JSON helpers ────────────────────────────────────────────────────

def _dumps(value: list) -> str:
    """Serialize a list to a compact JSON string."""
    return json.dumps(value, ensure_ascii=False)


def _loads(value: str | None) -> list:
    """Deserialize a JSON string to a list, returning [] on any failure."""
    if not value:
        return []
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


# ── WikiLink parser ──────────────────────────────────────────────────────────

_WIKI_LINK_RE = re.compile(r"\[\[([^\[\]]+?)\]\]")


def _parse_wikilinks(content: str) -> list[str]:
    """Extract all [[slug]] targets from a markdown content string.

    Returns a deduplicated list of slug strings preserving order.
    """
    seen: set[str] = set()
    slugs: list[str] = []
    for match in _WIKI_LINK_RE.finditer(content):
        slug = match.group(1).strip()
        if slug and slug not in seen:
            seen.add(slug)
            slugs.append(slug)
    return slugs


# ── CRUD: WikiPage ───────────────────────────────────────────────────────────

async def get_all_wiki_pages(db: AsyncSession) -> list[WikiPage]:
    """Return all wiki pages ordered by category then title."""
    result = await db.execute(
        select(WikiPage).order_by(WikiPage.category, WikiPage.title)
    )
    return list(result.scalars().all())


async def get_wiki_page_by_slug(db: AsyncSession, slug: str) -> WikiPage | None:
    """Return the wiki page with the given slug, or None if not found."""
    result = await db.execute(select(WikiPage).where(WikiPage.slug == slug))
    return result.scalar_one_or_none()


async def create_wiki_page(
    db: AsyncSession,
    slug: str,
    title: str,
    category: str,
    content: str,
    source_note_ids: list[str] | None = None,
    tags: list[str] | None = None,
    backlinks: list[str] | None = None,
) -> WikiPage:
    """Create a new wiki page and persist it.

    Automatically parses [[WikiLink]] references in content and propagates
    backlinks to the linked target pages.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    page = WikiPage(
        id=str(uuid.uuid4()),
        slug=slug,
        title=title,
        category=category,
        content=content,
        source_note_ids=_dumps(source_note_ids or []),
        tags=_dumps(tags or []),
        backlinks=_dumps(backlinks or []),
        created_at=now,
        updated_at=now,
    )
    db.add(page)
    await db.flush()  # get the page into the session without committing yet

    # Propagate backlinks: any [[slug]] in this page's content → add slug as
    # a backlink on the target page.
    await _propagate_backlinks(db, slug, content)

    await db.commit()
    await db.refresh(page)
    return page


async def update_wiki_page(
    db: AsyncSession,
    slug: str,
    content: str | None = None,
    title: str | None = None,
    tags: list[str] | None = None,
    source_note_ids: list[str] | None = None,
    backlinks: list[str] | None = None,
) -> WikiPage | None:
    """Update fields on an existing wiki page.

    Only non-None arguments are written. If content changes, backlink
    propagation is re-evaluated.
    """
    page = await get_wiki_page_by_slug(db, slug)
    if page is None:
        return None

    old_content = page.content

    if title is not None:
        page.title = title
    if content is not None:
        page.content = content
    if tags is not None:
        page.tags = _dumps(tags)
    if source_note_ids is not None:
        page.source_note_ids = _dumps(source_note_ids)
    if backlinks is not None:
        page.backlinks = _dumps(backlinks)

    page.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(page)
    await db.flush()

    # Re-propagate backlinks if content changed
    if content is not None and content != old_content:
        await _propagate_backlinks(db, slug, content)

    await db.commit()
    await db.refresh(page)
    return page


async def delete_wiki_page(db: AsyncSession, slug: str) -> bool:
    """Delete a wiki page by slug. Returns True if deleted, False if not found."""
    result = await db.execute(delete(WikiPage).where(WikiPage.slug == slug))
    await db.commit()
    return result.rowcount > 0  # type: ignore[return-value]


async def search_wiki_pages(db: AsyncSession, query: str) -> list[dict]:
    """BM25 full-text search over title + content of all wiki pages.

    Returns a list of dicts with slug, title, category, excerpt, and score,
    sorted by descending BM25 score. Pages with score 0 are excluded.
    """
    pages = await get_all_wiki_pages(db)
    if not pages:
        return []

    # Build corpus: title + content concatenated for scoring
    corpus = [f"{p.title} {p.content}" for p in pages]
    retriever = BM25Retriever(corpus)
    scores = retriever.get_scores(query)

    results = []
    for page, score in zip(pages, scores):
        if score <= 0.0:
            continue
        # Extract a short excerpt around the first query keyword hit
        excerpt = _make_excerpt(page.content, query)
        results.append({
            "slug": page.slug,
            "title": page.title,
            "category": page.category,
            "excerpt": excerpt,
            "score": round(score, 4),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results


async def get_wiki_index(db: AsyncSession) -> dict:
    """Return all wiki pages structured as a dict grouped by category.

    Shape:
        {
            "summary": [{"slug": ..., "title": ..., "tags": [...], "updated_at": ...}, ...],
            "entity":  [...],
            ...
        }
    """
    pages = await get_all_wiki_pages(db)
    index: dict[str, list[dict]] = {}
    for page in pages:
        cat = page.category
        if cat not in index:
            index[cat] = []
        index[cat].append({
            "slug": page.slug,
            "title": page.title,
            "content": page.content,
            "tags": _loads(page.tags),
            "updated_at": page.updated_at.isoformat(),
        })
    return index


async def get_wiki_log(db: AsyncSession) -> list[WikiIngestLog]:
    """Return the 50 most recent wiki ingest log entries (newest first)."""
    result = await db.execute(
        select(WikiIngestLog)
        .order_by(WikiIngestLog.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


async def get_wiki_graph(db: AsyncSession) -> dict:
    """Build a graph representation of the wiki for visualization.

    Returns:
        {
            "nodes": [{"id": slug, "title": ..., "category": ..., "connections": int}, ...],
            "edges": [{"source": slug, "target": slug}, ...],
        }

    Edges are derived from [[WikiLink]] syntax parsed from every page's content.
    An edge exists only when the target page exists in the wiki.
    """
    pages = await get_all_wiki_pages(db)
    slug_set = {p.slug for p in pages}

    # Count inbound connections per slug (how many pages link TO it)
    inbound: dict[str, int] = {p.slug: 0 for p in pages}
    edges: list[dict] = []

    for page in pages:
        targets = _parse_wikilinks(page.content)
        for target in targets:
            if target in slug_set:
                edges.append({"source": page.slug, "target": target})
                inbound[target] = inbound.get(target, 0) + 1

    nodes = [
        {
            "id": p.slug,
            "title": p.title,
            "category": p.category,
            "connections": inbound.get(p.slug, 0),
        }
        for p in pages
    ]

    return {"nodes": nodes, "edges": edges}


# ── CRUD: WikiIngestLog ──────────────────────────────────────────────────────

async def create_wiki_ingest_log(
    db: AsyncSession,
    note_id: str,
    note_title: str,
    pages_created: list[str],
    pages_updated: list[str],
    status: str,
    summary: str | None = None,
) -> WikiIngestLog:
    """Create and persist a wiki ingest log entry."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    log = WikiIngestLog(
        id=str(uuid.uuid4()),
        note_id=note_id,
        note_title=note_title,
        pages_created=_dumps(pages_created),
        pages_updated=_dumps(pages_updated),
        status=status,
        summary=summary,
        created_at=now,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


# ── Internal: backlink propagation ───────────────────────────────────────────

async def _propagate_backlinks(
    db: AsyncSession,
    source_slug: str,
    content: str,
) -> None:
    """Add source_slug as a backlink on every wiki page referenced via [[slug]].

    This is called after create/update so the graph stays consistent without
    a separate indexing pass.
    """
    targets = _parse_wikilinks(content)
    for target_slug in targets:
        target = await get_wiki_page_by_slug(db, target_slug)
        if target is None:
            continue
        existing = _loads(target.backlinks)
        if source_slug not in existing:
            existing.append(source_slug)
            target.backlinks = _dumps(existing)
            target.updated_at = datetime.now(timezone.utc)
            db.add(target)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_excerpt(content: str, query: str, window: int = 200) -> str:
    """Extract a short excerpt from content around the first keyword hit."""
    if not content:
        return ""
    query_lower = query.lower()
    content_lower = content.lower()

    # Try to find first query token in content
    tokens = re.findall(r"\w+", query_lower)
    pos = -1
    for token in tokens:
        idx = content_lower.find(token)
        if idx != -1:
            pos = idx
            break

    if pos == -1:
        # No hit — return beginning
        excerpt = content[:window]
    else:
        start = max(0, pos - window // 2)
        end = min(len(content), pos + window // 2)
        excerpt = content[start:end]

    # Strip markdown formatting for cleaner display
    excerpt = re.sub(r"[#*_`\[\]>]", "", excerpt)
    excerpt = re.sub(r"\s+", " ", excerpt).strip()
    return excerpt[:window] + ("…" if len(content) > window else "")
