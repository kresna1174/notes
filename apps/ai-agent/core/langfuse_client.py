"""
Langfuse Prompt Management client.

Usage:
    from core.langfuse_client import get_prompt

    instructions = get_prompt("writer_prompt", fallback=WRITER_PROMPT)

Prompts are fetched from Langfuse with a 60-second in-process TTL cache.
Falls back to the hardcoded string if Langfuse is unreachable or the prompt
does not exist yet — so the app works even without Langfuse configured.

To create/edit a prompt:
  1. Go to Langfuse dashboard → Prompts → New
  2. Name it exactly as the key used in get_prompt() (e.g. "writer_prompt")
  3. Set type to "text", add your prompt content
  4. Promote to "production" label
  Changes take effect within 60 seconds (TTL), no redeploy needed.
"""

import logging
import time
from typing import Optional

from core.settings import settings

logger = logging.getLogger("ai-agent")

# In-process cache: prompt_name → (text, fetched_at)
_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 60.0  # seconds

_langfuse_client = None


def _get_client():
    global _langfuse_client
    if _langfuse_client is not None:
        return _langfuse_client

    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None

    try:
        from langfuse import Langfuse
        _langfuse_client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        return _langfuse_client
    except Exception as e:
        logger.warning(f"[langfuse] Failed to init client: {e}")
        return None


def get_prompt(name: str, fallback: str, label: str = "production") -> str:
    """Fetch a prompt from Langfuse by name, with TTL cache and fallback.

    Args:
        name: Prompt name as defined in the Langfuse dashboard.
        fallback: Hardcoded prompt string to use if Langfuse is unavailable.
        label: Langfuse prompt label to fetch (default: "production").

    Returns:
        Prompt text from Langfuse if available, otherwise the fallback string.
    """
    now = time.monotonic()
    cached = _cache.get(name)
    if cached and (now - cached[1]) < _CACHE_TTL:
        return cached[0]

    client = _get_client()
    if client is None:
        return fallback

    try:
        prompt_obj = client.get_prompt(name, label=label)
        text = prompt_obj.prompt
        if not text or not text.strip():
            return fallback
        _cache[name] = (text, now)
        logger.info(f"[langfuse] Loaded prompt '{name}' (label={label})")
        return text
    except Exception as e:
        logger.warning(f"[langfuse] Could not fetch prompt '{name}': {e} — using fallback")
        return fallback


def invalidate_cache(name: Optional[str] = None) -> None:
    """Clear cached prompt(s). Pass name to clear one, or None to clear all."""
    if name:
        _cache.pop(name, None)
    else:
        _cache.clear()
