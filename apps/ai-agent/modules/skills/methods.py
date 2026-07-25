"""
Read-only access layer for AI skills (progressive disclosure — Opsi B).

Two levels of disclosure:
  - Catalog (name + description) — cheap, always injected into the parent prompt.
  - Content — loaded on demand via the ``load_skill`` tool when the agent picks a skill.

The ``ai_skills`` table is owned by the web app (Drizzle). This module only reads it.
Every function is **fail-open**: any DB error yields an empty catalog / no content so
that chat keeps working even if skills are unavailable (mirrors user-memory handling).

Catalog + content are cached in-process with a 60s TTL, matching the pattern in
``core/langfuse_client.py`` — admin changes take effect within ~60s without a restart.
"""

import logging
import time

from sqlalchemy import select, func

from core.database import AsyncSessionLocal
from core.models import AiSkill

logger = logging.getLogger("ai-agent")

# In-process caches (pola core/langfuse_client.py)
_catalog_cache: tuple[list[dict], float] | None = None
_content_cache: dict[str, tuple[str | None, float]] = {}
_CATALOG_TTL = 60.0  # seconds
_CONTENT_TTL = 60.0  # seconds

# Cap returned content so a huge skill can't blow up the context window.
_MAX_CONTENT_CHARS = 8000


async def get_skills_catalog() -> list[dict]:
    """Return ``[{slug, name, description}]`` for every enabled skill.

    Cached for 60s. Fail-open: on any error returns an empty list.
    """
    global _catalog_cache
    now = time.monotonic()
    if _catalog_cache and (now - _catalog_cache[1]) < _CATALOG_TTL:
        return _catalog_cache[0]

    try:
        async with AsyncSessionLocal() as session:
            rows = await session.execute(
                select(AiSkill.slug, AiSkill.name, AiSkill.description)
                .where(AiSkill.enabled.is_(True))
                .order_by(AiSkill.name)
            )
            catalog = [
                {"slug": slug, "name": name, "description": description or ""}
                for slug, name, description in rows.all()
            ]
        _catalog_cache = (catalog, now)
        return catalog
    except Exception as e:
        logger.warning(f"[skills] Failed to load catalog: {e} — returning empty catalog")
        return []


async def get_skill_content(identifier: str) -> str | None:
    """Return the content of a single enabled skill.

    Matches on ``slug`` first, then falls back to ``name`` (case-insensitive).
    Returns ``None`` if no enabled skill matches. Cached for 60s per identifier.
    Fail-open: on any error returns ``None``.
    """
    if not identifier or not identifier.strip():
        return None

    key = identifier.strip().lower()
    now = time.monotonic()
    cached = _content_cache.get(key)
    if cached and (now - cached[1]) < _CONTENT_TTL:
        return cached[0]

    try:
        async with AsyncSessionLocal() as session:
            # Prefer exact slug match, then case-insensitive name match.
            row = (await session.execute(
                select(AiSkill.content)
                .where(AiSkill.enabled.is_(True), AiSkill.slug == identifier.strip())
                .limit(1)
            )).first()

            if row is None:
                row = (await session.execute(
                    select(AiSkill.content)
                    .where(
                        AiSkill.enabled.is_(True),
                        func.lower(AiSkill.name) == key,
                    )
                    .limit(1)
                )).first()

        content = row[0] if row else None
        if content and len(content) > _MAX_CONTENT_CHARS:
            content = content[:_MAX_CONTENT_CHARS] + "\n\n[...konten skill dipotong...]"

        _content_cache[key] = (content, now)
        return content
    except Exception as e:
        logger.warning(f"[skills] Failed to load skill content for '{identifier}': {e}")
        return None


def format_skills_catalog(catalog: list[dict]) -> str:
    """Render the catalog as an ``## AVAILABLE SKILLS`` block, or ``""`` if empty."""
    if not catalog:
        return ""
    lines = [
        "## AVAILABLE SKILLS — panggil load_skill(name) untuk memuat instruksi lengkap",
    ]
    for skill in catalog:
        identifier = skill.get("slug") or skill.get("name") or ""
        description = skill.get("description") or ""
        lines.append(f"- {identifier}: {description}" if description else f"- {identifier}")
    return "\n".join(lines)


def invalidate_skills_cache() -> None:
    """Clear catalog + content caches (for optional web-app-driven invalidation)."""
    global _catalog_cache
    _catalog_cache = None
    _content_cache.clear()
