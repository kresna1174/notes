"""
Agent definitions for the Mindspace AI system.

Architecture:
  - Parent Agent (main orchestrator) delegates to specialized sub-agents.
  - Each sub-agent has a focused role, its own prompt, and a tailored toolset.
  - Sub-agents are exposed as tools to the parent via `.as_tool()`.
"""

from agents import Agent

from core.llm import get_model, default_model_settings
from core.prompt import (
    MAIN_ASSISTANT_PROMPT,
    SUMMARIZER_PROMPT,
    TAGGER_PROMPT,
    WRITER_PROMPT,
    RESEARCHER_PROMPT,
    TRANSLATOR_PROMPT,
    CODE_ANALYST_PROMPT,
    EDITOR_PROMPT,
)
from modules.chat.tools import (
    write_notes, update_note_direct,
    search_web, extract_web, crawl_web,
    execute_python_code, find_web_photos, find_youtube_videos,
    list_rag_documents, search_rag_documents,
    query_wiki, ingest_note_to_wiki, read_wiki_index,
)

# ── Shared toolsets ──────────────────────────────────────────────────────────

NOTE_TOOLS = [write_notes, update_note_direct]
WEB_TOOLS = [search_web, extract_web, crawl_web, find_web_photos, find_youtube_videos]
RAG_TOOLS = [list_rag_documents, search_rag_documents]
WIKI_TOOLS = [query_wiki, ingest_note_to_wiki, read_wiki_index]
ALL_TOOLS = NOTE_TOOLS + WEB_TOOLS + RAG_TOOLS + WIKI_TOOLS + [execute_python_code]


# ── Sub-Agents ───────────────────────────────────────────────────────────────

summarizer_agent = Agent(
    name="SummarizerSubAgent",
    instructions=SUMMARIZER_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[],  # Summarizer does not need tools — it only produces text.
)

tagger_agent = Agent(
    name="TaggerSubAgent",
    instructions=TAGGER_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[],  # Tagger only produces text.
)

writer_agent = Agent(
    name="WriterSubAgent",
    instructions=WRITER_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=ALL_TOOLS,  # Writer can research, write notes, and query RAG.
)

researcher_agent = Agent(
    name="ResearcherSubAgent",
    instructions=RESEARCHER_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=ALL_TOOLS,  # Researcher can search, save findings, run code, and query RAG.
)

translator_agent = Agent(
    name="TranslatorSubAgent",
    instructions=TRANSLATOR_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=NOTE_TOOLS,  # Translator can directly update the note with translated text.
)

code_analyst_agent = Agent(
    name="CodeAnalystSubAgent",
    instructions=CODE_ANALYST_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=ALL_TOOLS,  # Code analyst can run code, research, write notes, and query RAG.
)

editor_agent = Agent(
    name="EditorSubAgent",
    instructions=EDITOR_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    # update_note_direct is included so the model doesn't error if it tries to call it
    # (session history may contain prior note-tool calls). The frontend intercepts
    # tool-input-available and inserts the content directly at cursor — no approval dialog.
    tools=[update_note_direct, execute_python_code] + WEB_TOOLS + RAG_TOOLS,
)


# ── Parent Agent (Orchestrator) ──────────────────────────────────────────────

parent_agent = Agent(
    name="NotesParentAssistant",
    instructions=MAIN_ASSISTANT_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[
        # Sub-agents exposed as tools
        summarizer_agent.as_tool(
            tool_name="summarize_expert",
            tool_description="Delegate to summarize note content into concise bullet points.",
        ),
        tagger_agent.as_tool(
            tool_name="tagger_expert",
            tool_description="Delegate to extract 3-5 relevant tags from note content.",
        ),
        writer_agent.as_tool(
            tool_name="writer_expert",
            tool_description="Delegate to draft, expand, or restructure written content for a note.",
        ),
        researcher_agent.as_tool(
            tool_name="researcher_expert",
            tool_description="Delegate to research a topic via web search and compile findings.",
        ),
        translator_agent.as_tool(
            tool_name="translator_expert",
            tool_description="Delegate to translate text between languages while preserving formatting.",
        ),
        code_analyst_agent.as_tool(
            tool_name="code_analyst_expert",
            tool_description="Delegate to write and execute Python code for data analysis or chart generation.",
        ),
        editor_agent.as_tool(
            tool_name="editor_expert",
            tool_description="Delegate to refine, proofread, or improve existing text content.",
        ),
        # Direct tools for the parent agent
        *ALL_TOOLS,
    ],
)


# ── Agent Registry ───────────────────────────────────────────────────────────
# Maps agent keys to their Agent instances for dynamic lookup.

AGENT_REGISTRY: dict[str, Agent] = {
    "main": parent_agent,
    "summarizer": summarizer_agent,
    "tagger": tagger_agent,
    "writer": writer_agent,
    "researcher": researcher_agent,
    "translator": translator_agent,
    "code_analyst": code_analyst_agent,
    "editor": editor_agent,
}

# Agents that can be selected directly by the user (exposed in UI).
DIRECT_SELECT_AGENTS = ["main", "writer", "researcher", "translator", "code_analyst", "editor"]


def get_agent(key: str | None) -> Agent:
    """Resolve an agent key to its Agent instance.

    - If key is None or "main" or "auto", return the parent agent.
    - If key matches a registry entry, return that agent.
    - Otherwise, fall back to the parent agent.
    """
    if not key or key in ("main", "auto"):
        return parent_agent
    return AGENT_REGISTRY.get(key, parent_agent)


# ── Intent Detection ─────────────────────────────────────────────────────────
# Keyword-based intent routing for "auto" mode.
# When agent="auto", the system uses these patterns to pick the best sub-agent.

_INTENT_PATTERNS: dict[str, list[str]] = {
    "writer": [
        "write", "draft", "create a note about", "compose", "blog post",
        "article", "documentation", "meeting notes", "report", "essay",
        "bikin catatan", "tulis", "buat artikel", "draft",
    ],
    "researcher": [
        "search for", "research", "find information", "look up",
        "what is", "explain", "tell me about", "find out",
        "cari info", "cari tentang", "jelaskan", "apa itu",
    ],
    "translator": [
        "translate", "terjemahkan", "translate to", "ubah ke bahasa",
    ],
    "code_analyst": [
        "analyze data", "create chart", "plot", "graph", " visualize",
        "python code", "run code", "execute code", "generate chart",
        "analisis data", "buat chart", "buat grafik", "jalankan kode",
    ],
    "editor": [
        "fix grammar", "proofread", "improve", "refine", "edit this",
        "perbaiki grammar", "perbaiki tulisan", "improve writing",
    ],
    "summarizer": [
        "summarize", "summary", "ringkas", "ringkasan", "buatin summary",
    ],
    "tagger": [
        "add tags", "extract tags", "generate tags", "tag this",
        "tambahin tag", "ambilin tag",
    ],
}


def detect_intent(message: str) -> str | None:
    """Detect the best agent based on keyword patterns in the user message.

    Returns the agent key if a strong intent match is found, else None.
    """
    msg_lower = message.lower()

    # Check each agent's patterns
    scores: dict[str, int] = {}
    for agent_key, patterns in _INTENT_PATTERNS.items():
        score = 0
        for pattern in patterns:
            if pattern in msg_lower:
                score += 1
        if score > 0:
            scores[agent_key] = score

    if not scores:
        return None

    # Return the agent with the highest pattern match count
    return max(scores, key=scores.get)


def resolve_agent(agent_key: str | None, message: str) -> Agent:
    """Resolve which agent to use based on explicit key or auto-detection.

    - If agent_key is explicitly set (not "auto"), use that agent.
    - If agent_key is "auto" or None, detect intent from the message.
    - Fall back to parent agent if no match.
    """
    if agent_key and agent_key != "auto":
        return get_agent(agent_key)

    # Auto-detect intent
    detected = detect_intent(message)
    if detected:
        return get_agent(detected)

    return parent_agent
