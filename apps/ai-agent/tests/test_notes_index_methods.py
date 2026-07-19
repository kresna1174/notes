import pytest
from modules.notes_index.methods import strip_tiptap_json, hash_content


def test_strip_tiptap_json_extracts_text():
    tiptap = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}'
    result = strip_tiptap_json(tiptap)
    assert "Hello world" in result


def test_strip_tiptap_json_nested():
    tiptap = '{"type":"doc","content":[{"type":"heading","content":[{"type":"text","text":"Title"}]},{"type":"paragraph","content":[{"type":"text","text":"Body text"}]}]}'
    result = strip_tiptap_json(tiptap)
    assert "Title" in result
    assert "Body text" in result


def test_strip_tiptap_json_plain_text_passthrough():
    plain = "This is plain text, not JSON"
    assert strip_tiptap_json(plain) == plain


def test_strip_tiptap_json_empty_doc():
    tiptap = '{"type":"doc","content":[]}'
    result = strip_tiptap_json(tiptap)
    assert result == ""


def test_hash_content_deterministic():
    h1 = hash_content("My Note", "Some content")
    h2 = hash_content("My Note", "Some content")
    assert h1 == h2


def test_hash_content_differs_on_change():
    h1 = hash_content("My Note", "Some content")
    h2 = hash_content("My Note", "Different content")
    assert h1 != h2
