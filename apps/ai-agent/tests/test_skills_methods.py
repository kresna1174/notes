import asyncio

import pytest

from modules.skills import methods as skills


@pytest.fixture(autouse=True)
def _clear_skills_cache():
    """Each test starts with a clean cache so TTL state doesn't leak across tests."""
    skills.invalidate_skills_cache()
    yield
    skills.invalidate_skills_cache()


def _run(coro):
    """Drive a coroutine to completion without requiring pytest-asyncio."""
    return asyncio.run(coro)


class _FakeSession:
    """Minimal async-context-manager session whose ``execute`` is scripted."""

    def __init__(self, execute_fn):
        self._execute_fn = execute_fn

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, _stmt):
        return self._execute_fn()


def _rows_result(rows):
    class _R:
        def all(self):
            return rows
    return _R()


def _first_result(value):
    class _R:
        def first(self):
            return value
    return _R()


# ── format_skills_catalog ─────────────────────────────────────────────────────

def test_format_empty_catalog_returns_empty_string():
    assert skills.format_skills_catalog([]) == ""


def test_format_catalog_renders_block_with_header_and_items():
    catalog = [
        {"slug": "sop-writer", "name": "SOP Writer", "description": "Menyusun SOP baku"},
        {"slug": "fin", "name": "Finance", "description": "Analisis keuangan"},
    ]
    out = skills.format_skills_catalog(catalog)
    assert out.startswith("## AVAILABLE SKILLS")
    assert "- sop-writer: Menyusun SOP baku" in out
    assert "- fin: Analisis keuangan" in out


def test_format_catalog_prefers_slug_then_name_and_tolerates_missing_description():
    catalog = [{"slug": None, "name": "Only Name", "description": ""}]
    out = skills.format_skills_catalog(catalog)
    assert "- Only Name" in out


# ── get_skills_catalog ────────────────────────────────────────────────────────

def test_get_catalog_maps_rows_and_caches(monkeypatch):
    calls = {"n": 0}

    def _execute():
        calls["n"] += 1
        return _rows_result([("sop-writer", "SOP Writer", "Menyusun SOP")])

    monkeypatch.setattr(skills, "AsyncSessionLocal", lambda: _FakeSession(_execute))

    first = _run(skills.get_skills_catalog())
    assert first == [{"slug": "sop-writer", "name": "SOP Writer", "description": "Menyusun SOP"}]

    # Second call within TTL should hit the cache, not the DB.
    second = _run(skills.get_skills_catalog())
    assert second == first
    assert calls["n"] == 1


def test_get_catalog_fails_open_to_empty_list(monkeypatch):
    def _boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(skills, "AsyncSessionLocal", _boom)
    assert _run(skills.get_skills_catalog()) == []


# ── get_skill_content ─────────────────────────────────────────────────────────

def test_get_content_returns_none_for_blank_identifier():
    assert _run(skills.get_skill_content("")) is None
    assert _run(skills.get_skill_content("   ")) is None


def test_get_content_returns_content_when_found(monkeypatch):
    monkeypatch.setattr(
        skills, "AsyncSessionLocal",
        lambda: _FakeSession(lambda: _first_result(("full skill instructions",))),
    )
    assert _run(skills.get_skill_content("sop-writer")) == "full skill instructions"


def test_get_content_returns_none_when_missing(monkeypatch):
    monkeypatch.setattr(
        skills, "AsyncSessionLocal",
        lambda: _FakeSession(lambda: _first_result(None)),
    )
    assert _run(skills.get_skill_content("does-not-exist")) is None


def test_get_content_truncates_oversized_content(monkeypatch):
    big = "x" * (skills._MAX_CONTENT_CHARS + 500)
    monkeypatch.setattr(
        skills, "AsyncSessionLocal",
        lambda: _FakeSession(lambda: _first_result((big,))),
    )
    out = _run(skills.get_skill_content("huge"))
    assert len(out) < len(big)
    assert out.startswith("x" * 100)
    assert "dipotong" in out


def test_get_content_fails_open_to_none(monkeypatch):
    def _boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(skills, "AsyncSessionLocal", _boom)
    assert _run(skills.get_skill_content("anything")) is None
