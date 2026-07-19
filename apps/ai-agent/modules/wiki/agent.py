"""
Wiki-specific AI agent and function tools for the LLM Wiki module.

The WikiIngestAgent is a self-contained OpenAI Agents SDK Agent that:
  1. Reads the current wiki index.
  2. Creates/updates wiki pages (summaries, entities, concepts, syntheses).
  3. Uses [[WikiLink]] cross-references.
  4. Appends an audit entry to the ingest log.

Tools are also used internally by the lint agent.
"""

import json
import logging

from agents import function_tool, RunContextWrapper, Agent

from core.llm import get_model, default_model_settings
from core.database import AsyncSessionLocal
from modules.wiki import methods as wiki_methods

logger = logging.getLogger("ai-agent")


# ── Helper: get a short-lived DB session inside a tool ───────────────────────

async def _get_db_session():
    """Return a new AsyncSession to be used (and closed) inside a tool call."""
    return AsyncSessionLocal()


# ── Tool: read_wiki_index ────────────────────────────────────────────────────

@function_tool
async def read_wiki_index(ctx: RunContextWrapper[dict]) -> str:
    """Read the wiki index to see all available wiki pages grouped by category.

    Returns a structured Markdown document listing every page's slug, title,
    and tags so the agent can decide which pages already exist before writing.
    """
    async with AsyncSessionLocal() as db:
        index = await wiki_methods.get_wiki_index(db)

    if not index:
        return "The wiki is currently empty. No pages have been created yet."

    lines = ["# Wiki Index\n"]
    category_order = ["summary", "entity", "concept", "synthesis", "index", "log"]
    # Show known categories first, then any extra ones alphabetically
    all_cats = list(index.keys())
    ordered_cats = [c for c in category_order if c in all_cats] + sorted(
        c for c in all_cats if c not in category_order
    )

    for cat in ordered_cats:
        entries = index[cat]
        lines.append(f"\n## {cat.capitalize()} ({len(entries)} pages)\n")
        for entry in entries:
            tags_str = ", ".join(entry["tags"]) if entry["tags"] else "—"
            lines.append(
                f"- **[[{entry['slug']}]]** — {entry['title']}  "
                f"_(tags: {tags_str}, updated: {entry['updated_at'][:10]})_"
            )

    return "\n".join(lines)


# ── Tool: read_wiki_page ─────────────────────────────────────────────────────

@function_tool
async def read_wiki_page(ctx: RunContextWrapper[dict], slug: str) -> str:
    """Read the full content of a wiki page by its slug.

    Args:
        slug: The page slug (e.g. 'entities/openai' or 'summaries/note_abc123').

    Returns the page content in Markdown, or an error message if not found.
    """
    async with AsyncSessionLocal() as db:
        page = await wiki_methods.get_wiki_page_by_slug(db, slug)

    if page is None:
        return f"No wiki page found with slug '{slug}'. You may create it with write_wiki_page."

    data = page.to_dict()
    header = (
        f"# {data['title']}\n"
        f"**Slug:** {data['slug']}  \n"
        f"**Category:** {data['category']}  \n"
        f"**Tags:** {', '.join(data['tags']) or '—'}  \n"
        f"**Source notes:** {', '.join(data['source_note_ids']) or '—'}  \n"
        f"**Backlinks:** {', '.join(data['backlinks']) or '—'}  \n"
        f"**Last updated:** {data['updated_at']}\n\n"
        "---\n\n"
    )
    return header + data["content"]


# ── Tool: write_wiki_page ────────────────────────────────────────────────────

@function_tool
async def write_wiki_page(
    ctx: RunContextWrapper[dict],
    slug: str,
    title: str,
    category: str,
    content: str,
    source_note_ids: list[str],
    tags: list[str],
) -> str:
    """Create or update a wiki page.

    If a page with the given slug already exists it will be updated (merged);
    otherwise a new page is created.

    Content must be Markdown. Use [[slug]] syntax to cross-reference other
    wiki pages. Slugs must be lowercase with underscores/hyphens and optional
    path separators (e.g. 'entities/elon_musk', 'concepts/transformer_model').

    Args:
        slug: Unique identifier for the page (e.g. 'summaries/note_abc').
        title: Human-readable page title.
        category: One of: summary, entity, concept, synthesis, index, log.
        content: Full Markdown content for the page.
        source_note_ids: List of note IDs that contributed to this page.
        tags: List of tags/keywords.

    Returns a confirmation string with the slug and action taken.
    """
    async with AsyncSessionLocal() as db:
        existing = await wiki_methods.get_wiki_page_by_slug(db, slug)

        if existing is not None:
            # Update: merge source_note_ids from old + new
            import json as _json
            old_note_ids = _json.loads(existing.source_note_ids or "[]")
            merged_note_ids = list(dict.fromkeys(old_note_ids + source_note_ids))

            await wiki_methods.update_wiki_page(
                db,
                slug=slug,
                title=title,
                content=content,
                tags=tags,
                source_note_ids=merged_note_ids,
            )
            action = "updated"
        else:
            await wiki_methods.create_wiki_page(
                db,
                slug=slug,
                title=title,
                category=category,
                content=content,
                source_note_ids=source_note_ids,
                tags=tags,
            )
            action = "created"

    logger.info(f"WikiAgent: page {action}: {slug}")
    return f"Wiki page '{slug}' ({category}) successfully {action}."


# ── Tool: append_to_wiki_log ─────────────────────────────────────────────────

@function_tool
async def append_to_wiki_log(
    ctx: RunContextWrapper[dict],
    note_id: str,
    note_title: str,
    pages_created: list[str],
    pages_updated: list[str],
    summary: str,
) -> str:
    """Append an entry to the wiki ingest audit log.

    Call this at the end of every ingest run to record what was created or
    updated and why.

    Args:
        note_id: The unique ID of the source note that was ingested.
        note_title: Human-readable title of the source note.
        pages_created: List of wiki slugs created during this run.
        pages_updated: List of wiki slugs updated during this run.
        summary: A brief description of what the agent did (1-3 sentences).

    Returns a confirmation string with the log entry ID.
    """
    async with AsyncSessionLocal() as db:
        log = await wiki_methods.create_wiki_ingest_log(
            db,
            note_id=note_id,
            note_title=note_title,
            pages_created=pages_created,
            pages_updated=pages_updated,
            status="completed",
            summary=summary,
        )
    logger.info(
        f"WikiAgent: ingest log created (id={log.id}) — "
        f"created={pages_created}, updated={pages_updated}"
    )
    return f"Ingest log entry recorded (id={log.id})."


# ── Wiki Ingest Agent ────────────────────────────────────────────────────────

WIKI_INGEST_PROMPT = """
You are the **Wiki Maintainer** for Mindspace. Your job is to read a note and
update the persistent, cross-linked wiki knowledge base.

## Wiki Page Categories
- **summary** — One page per ingested note. A concise summary of the note's key information.
  Slug format: `summaries/{note_id}`
- **entity** — Pages for people, places, organisations, products, and projects mentioned in notes.
  Slug format: `entities/{entity_name_lowercase_underscore}`
- **concept** — Pages for ideas, topics, and recurring themes.
  Slug format: `concepts/{concept_name_lowercase_underscore}`
- **synthesis** — Cross-note analysis, comparisons, or conclusions drawn from multiple notes.
  Slug format: `synthesis/{descriptive_name}`

## Workflow (follow this exactly)
1. Call `read_wiki_index()` to see what already exists.
2. Write a **summary page** for this note (slug: `summaries/{note_id}`).
   - If the page already exists, update it with new information rather than replacing it.
3. For each notable **entity** (person, org, project, product, place) mentioned:
   - Call `read_wiki_page(slug)` first to check if the page already exists.
   - Create or update the entity page with merged information.
   - Flag factual contradictions with a `> [!CONFLICT]` callout.
4. For each **concept** or recurring **theme**:
   - Create or update a concept page.
5. Use `[[slug]]` syntax to cross-reference related pages (e.g. `[[entities/openai]]`).
6. Call `append_to_wiki_log()` with a list of all pages created and updated.
7. Return a brief plain-text summary of what you did (2-4 sentences).

## Style Rules
- Always read the existing page before updating it — never blindly overwrite.
- Merge new information with existing content. Preserve what is already there.
- Be concise. One short paragraph per concept. Use bullet points for facts.
- Slugs must be `lowercase_with_underscores`, no spaces, no capitals.
  Path separator `/` is allowed (e.g. `entities/project_x`).
- Content must be valid Markdown with `[[WikiLink]]` cross-references.
- Do NOT add any preamble or sign-off text — your final message is only the summary.
"""

wiki_ingest_agent = Agent(
    name="WikiIngestAgent",
    instructions=WIKI_INGEST_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[read_wiki_index, read_wiki_page, write_wiki_page, append_to_wiki_log],
)


# ── Wiki Lint Agent ──────────────────────────────────────────────────────────

WIKI_LINT_PROMPT = """
You are the **Wiki Health Checker** for Mindspace. Your job is to audit the
wiki and produce a structured JSON health report.

## Steps
1. Call `read_wiki_index()` to get an overview.
2. For any pages that look suspicious (no links, etc.), call `read_wiki_page(slug)`.
3. Return a JSON object with exactly these keys:

```json
{
  "orphan_pages": ["slug1", "slug2"],
  "missing_link_targets": [{"source": "slug", "target": "missing_slug"}],
  "empty_pages": ["slug"],
  "stale_backlinks": [{"page": "slug", "stale_backlink": "source_slug"}],
  "summary": "Short description of wiki health."
}
```

## Definitions
- **orphan_pages**: Pages not referenced by any [[WikiLink]] in other pages.
- **missing_link_targets**: [[WikiLink]] entries pointing to slugs that don't exist.
- **empty_pages**: Pages with content shorter than 20 characters.
- **stale_backlinks**: Backlinks listed on a page that are no longer referenced by the source.
- Return ONLY the JSON object — no surrounding text.
"""

wiki_lint_agent = Agent(
    name="WikiLintAgent",
    instructions=WIKI_LINT_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[read_wiki_index, read_wiki_page],
)
