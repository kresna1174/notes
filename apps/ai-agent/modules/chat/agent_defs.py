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
    JUDGE_PROMPT,
)
from modules.chat.tools import (
    write_notes, update_note_direct,
    search_web, extract_web, crawl_web,
    execute_python_code, find_web_photos, find_youtube_videos,
    list_rag_documents, search_rag_documents,
    query_wiki, ingest_note_to_wiki, read_wiki_index,
    search_knowledge,
    remember_user_fact, forget_user_fact,
)

# ── Shared toolsets ──────────────────────────────────────────────────────────

NOTE_TOOLS = [write_notes, update_note_direct]
WEB_TOOLS = [search_web, extract_web, crawl_web, find_web_photos, find_youtube_videos]
RAG_TOOLS = [list_rag_documents, search_rag_documents]
WIKI_TOOLS = [query_wiki, ingest_note_to_wiki, read_wiki_index]
MEMORY_TOOLS = [remember_user_fact, forget_user_fact]
ALL_TOOLS = NOTE_TOOLS + WEB_TOOLS + RAG_TOOLS + WIKI_TOOLS + MEMORY_TOOLS + [execute_python_code, search_knowledge]


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


# ── Judge Agent (background evaluator, not user-facing) ──────────────────────

judge_agent = Agent(
    name="JudgeAgent",
    instructions=JUDGE_PROMPT,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[],
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


# ── Semantic Router ───────────────────────────────────────────────────────────
# Embedding-based intent routing for "auto" mode.
# Pre-computes agent description embeddings at startup, routes by cosine similarity.

_AGENT_DESCRIPTIONS: dict[str, str] = {
    "writer": "write draft compose create content article blog post essay report documentation note",
    "researcher": "research search find information look up explain what is tell me about topic",
    "translator": "translate terjemahkan convert language ubah bahasa inggris indonesia",
    "code_analyst": "analyze data create chart plot graph visualize python code execute run calculate",
    "editor": "fix grammar proofread improve refine edit perbaiki tulisan",
    "summarizer": "summarize summary ringkas ringkasan shorten condense",
    "tagger": "add tags extract tags generate tags keyword label kategorikan",
}

_SIMILARITY_THRESHOLD = 0.55

_agent_embeddings: dict[str, list[float]] = {}
_embeddings_ready = False


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


async def _ensure_agent_embeddings() -> bool:
    global _embeddings_ready
    if _embeddings_ready:
        return True
    try:
        from modules.rag.methods import generate_embeddings
        keys = list(_AGENT_DESCRIPTIONS.keys())
        vecs = await generate_embeddings([_AGENT_DESCRIPTIONS[k] for k in keys])
        if not vecs:
            return False
        for key, vec in zip(keys, vecs):
            _agent_embeddings[key] = vec
        _embeddings_ready = True
        return True
    except Exception:
        return False


async def detect_intent_semantic(message: str) -> str | None:
    """Route message to best agent via embedding cosine similarity."""
    if not await _ensure_agent_embeddings() or not _agent_embeddings:
        return None
    try:
        from modules.rag.methods import generate_query_embedding
        query_vec = await generate_query_embedding(message)
        if not query_vec:
            return None
        scores = {k: _cosine_similarity(query_vec, v) for k, v in _agent_embeddings.items()}
        best_key = max(scores, key=scores.get)
        if scores[best_key] >= _SIMILARITY_THRESHOLD:
            return best_key
    except Exception:
        pass
    return None


async def resolve_agent_async(agent_key: str | None, message: str) -> Agent:
    """Async resolve with semantic routing — use this in async contexts."""
    if agent_key and agent_key != "auto":
        return get_agent(agent_key)
    detected = await detect_intent_semantic(message)
    return get_agent(detected) if detected else parent_agent


def resolve_agent(agent_key: str | None, message: str) -> Agent:
    """Sync fallback — no semantic routing. Use resolve_agent_async in async contexts."""
    if agent_key and agent_key != "auto":
        return get_agent(agent_key)
    return parent_agent
