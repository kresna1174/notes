import asyncio
import json
import os
import subprocess
import sys
import uuid
import ast
from urllib.parse import urljoin, urlparse

import httpx
from lxml import html
from ddgs import DDGS
from agents import function_tool, RunContextWrapper


def tool_error(code: str, message: str) -> str:
    """Return a structured JSON error string so agents can detect failure reliably."""
    return json.dumps({"error": True, "code": code, "message": message})


def format_as_tiptap(text: str) -> str:
    """
    Check if the text is already JSON. If not, convert it from Markdown to HTML
    so that Tiptap can parse all headings, lists, links, images, and videos correctly on the frontend.
    """
    if not text:
        return json.dumps({"type": "doc", "content": []})
    try:
        json.loads(text)
        return text
    except ValueError:
        pass

    try:
        import markdown
        html_content = markdown.markdown(text, extensions=['extra', 'nl2br'])
        return html_content
    except Exception:
        return f"<p>{text}</p>"


@function_tool
def write_notes(
    ctx: RunContextWrapper[dict],
    title: str,
    content: str,
    note_id: str | None = None
) -> str:
    """
    Propose updating the current note with new title and content. This action requires user approval.
    Use this when writing substantial content to the note (research findings, drafts, rewrites).

    Args:
        ctx: Run context containing user session details.
        title: The proposed title of the note.
        content: The proposed text content of the note (raw text or TipTap JSON format).
        note_id: Optional ID of the note to update. Defaults to the current note.
    """
    formatted_content = format_as_tiptap(content)
    target_id = note_id or (ctx.context.get("session_id") if ctx.context else None)

    return json.dumps({
        "status": "pending_approval",
        "title": title,
        "content": formatted_content,
        "note_id": target_id
    })


@function_tool
def create_new_note(
    ctx: RunContextWrapper[dict],
    title: str,
    content: str
) -> str:
    """
    Propose creating a brand new note. This action requires user approval.

    Args:
        ctx: Run context containing user session details.
        title: The proposed title of the new note.
        content: The proposed text content of the new note (raw text or TipTap JSON format).
    """
    formatted_content = format_as_tiptap(content)
    return json.dumps({
        "status": "pending_approval",
        "title": title,
        "content": formatted_content
    })


@function_tool
def update_note_direct(
    ctx: RunContextWrapper[dict],
    title: str,
    content: str
) -> str:
    """
    Directly update the current note with new title and content. This executes instantly without user approval.
    Use this for inline edits: grammar fixes, translations, formatting corrections.

    Args:
        ctx: Run context containing user session details.
        title: The new title for the note.
        content: The new text content for the note (raw text or TipTap JSON format).
    """
    formatted_content = format_as_tiptap(content)
    target_id = ctx.context.get("session_id") if ctx.context else None
    return json.dumps({
        "status": "direct_update",
        "title": title,
        "content": formatted_content,
        "note_id": target_id
    })


@function_tool
async def search_web(query: str, max_results: int = 5) -> str:
    """
    Search the web for a given query and return a summary of search results.

    Args:
        query: The search query to look up on the web.
        max_results: The maximum number of search results to return (default is 5).
    """
    try:
        def _run():
            with DDGS() as ddgs:
                return ddgs.text(query, max_results=max_results)

        results = await asyncio.to_thread(_run)
        if not results:
            return tool_error("no_results", f"No results found for query: {query}")

        output = []
        for r in results:
            output.append(f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}\n")
        return "\n---\n".join(output)
    except Exception as e:
        return tool_error("search_failed", str(e))


@function_tool
async def find_web_photos(query: str, max_results: int = 5) -> str:
    """
    Search the web for photos/images matching a query.
    Returns a list of image source URLs and titles.

    Args:
        query: The keyword or description of the image to search for.
        max_results: The maximum number of photos to return (default is 5).
    """
    try:
        def _run():
            with DDGS() as ddgs:
                return list(ddgs.images(query, max_results=max_results))

        results = await asyncio.to_thread(_run)
        if not results:
            return tool_error("no_results", f"No photos found for query: {query}")

        output = []
        for idx, r in enumerate(results, 1):
            title = r.get("title", f"Image {idx}")
            img_url = r.get("image")
            page_url = r.get("url")
            if img_url:
                output.append(f"Title: {title}\nImage URL: {img_url}\nPage URL: {page_url}\n")
        return "\n---\n".join(output)
    except Exception as e:
        return tool_error("photo_search_failed", str(e))


@function_tool
async def find_youtube_videos(query: str, max_results: int = 5) -> str:
    """
    Search YouTube for videos matching a query.
    Returns a list of video titles, URLs, and embed URLs.

    Args:
        query: The search query for YouTube videos.
        max_results: The maximum number of videos to return (default is 5).
    """
    search_query = query
    if "youtube" not in query.lower() and "site:youtube.com" not in query.lower():
        search_query = f"{query} site:youtube.com"

    try:
        def _run():
            with DDGS() as ddgs:
                return list(ddgs.videos(search_query, max_results=max_results))

        results = await asyncio.to_thread(_run)
        if not results:
            return tool_error("no_results", f"No YouTube videos found for query: {query}")

        output = []
        for idx, r in enumerate(results, 1):
            title = r.get("title", f"Video {idx}")
            video_url = r.get("content")
            embed_url = r.get("embed_url")
            publisher = r.get("publisher", "YouTube")
            if video_url:
                output.append(f"Title: {title}\nVideo URL: {video_url}\nEmbed URL: {embed_url}\nPublisher: {publisher}\n")
        return "\n---\n".join(output)
    except Exception as e:
        return tool_error("youtube_search_failed", str(e))


@function_tool
async def extract_web(url: str) -> str:
    """
    Fetch a web page's URL and extract its main text content as markdown.

    Args:
        url: The web page URL to extract content from.
    """
    try:
        def _run():
            with DDGS() as ddgs:
                return ddgs.extract(url, fmt="text_markdown")

        res = await asyncio.to_thread(_run)
        if not res or not res.get("content"):
            return tool_error("extract_failed", f"Could not extract content from URL: {url}")
        return f"URL: {res.get('url')}\n\nContent:\n{res.get('content')}"
    except Exception as e:
        return tool_error("extract_failed", str(e))


@function_tool
async def crawl_web(url: str, max_pages: int = 5) -> str:
    """
    Recursively crawl a website starting from a URL up to a maximum page count, extracting content.

    Args:
        url: The starting page URL to crawl.
        max_pages: The maximum number of domain pages to fetch (default is 5).
    """
    parsed_start = urlparse(url)
    domain = parsed_start.netloc
    if not domain:
        return "Invalid URL: missing domain/hostname"

    visited = set()
    to_visit = [url]
    results = []

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    try:
        async with httpx.AsyncClient(headers=headers, timeout=10.0, follow_redirects=True) as client:
            while to_visit and len(visited) < max_pages:
                current_url = to_visit.pop(0)
                if current_url in visited:
                    continue

                visited.add(current_url)
                try:
                    resp = await client.get(current_url)
                    if resp.status_code != 200:
                        results.append(f"URL: {current_url}\nStatus: {resp.status_code}\nContent: Failed to fetch\n")
                        continue

                    content_type = resp.headers.get("content-type", "")
                    if "text/html" not in content_type:
                        results.append(f"URL: {current_url}\nContent: Non-HTML content ({content_type})\n")
                        continue

                    tree = html.fromstring(resp.content)
                    paragraphs = tree.xpath("//p/text() | //h1/text() | //h2/text() | //h3/text()")
                    text_content = " ".join([p.strip() for p in paragraphs if p.strip()])
                    text_content = text_content[:1000] + ("..." if len(text_content) > 1000 else "")

                    results.append(f"URL: {current_url}\nContent:\n{text_content}\n")

                    links = tree.xpath("//a[@href]/@href")
                    for link in links:
                        full_link = urljoin(current_url, link)
                        parsed_link = urlparse(full_link)
                        if parsed_link.netloc == domain and full_link not in visited and full_link not in to_visit:
                            to_visit.append(full_link)

                except Exception as ex:
                    results.append(f"URL: {current_url}\nError: {str(ex)}\n")

        return f"Crawled {len(visited)} pages from {domain}:\n\n" + "\n---\n".join(results)
    except Exception as e:
        return tool_error("crawl_failed", str(e))


def is_code_safe(code: str) -> tuple[bool, str]:
    blocked_keywords = [
        "docker", "docker-compose", "rm -rf", "rmdir", "chmod", "chown",
        ".env", "sessions.db", "config.json", "/etc/", ".ssh", "id_rsa",
        "authorized_keys", "known_hosts", "eval(", "exec(", "shutil.rmtree", "os.system",
        "os.remove", "os.unlink", "os.rmdir", "os.popen", "subprocess.run"
    ]
    code_lower = code.lower()
    for kw in blocked_keywords:
        if kw in code_lower:
            return False, f"Security Block: Blocked keyword or command pattern detected: '{kw}'"

    try:
        tree = ast.parse(code)
    except SyntaxError as se:
        return False, f"Syntax Error: {str(se)}"

    blocked_modules = {
        "subprocess", "os", "sys", "shutil", "socket", "urllib", "requests",
        "httpx", "http", "webbrowser", "pty", "platform", "ctypes", "builtins",
        "importlib", "runpy", "code", "pdb", "ipdb"
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_module = alias.name.split('.')[0]
                if root_module in blocked_modules:
                    return False, f"Security Block: Import of module '{root_module}' is strictly prohibited."
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root_module = node.module.split('.')[0]
                if root_module in blocked_modules:
                    return False, f"Security Block: Import from module '{root_module}' is strictly prohibited."

        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
                if func_name in ["eval", "exec", "compile", "globals", "locals", "getattr", "setattr", "__import__"]:
                    return False, f"Security Block: Calling standard function '{func_name}' is strictly prohibited."

            elif isinstance(node.func, ast.Attribute):
                if node.func.attr in ["eval", "exec", "system", "popen", "run", "spawn", "fork", "remove", "unlink", "rmdir", "rmtree"]:
                    return False, f"Security Block: Invoking attribute/method '{node.func.attr}' is strictly prohibited."

        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            val = node.value.lower()
            if ".." in val or ".env" in val or "sessions.db" in val or ".ssh" in val or "/etc/" in val:
                return False, f"Security Block: File path/value '{node.value}' contains restricted keywords or directory traversal."

    return True, "Code is safe."


@function_tool
def execute_python_code(code: str) -> str:
    """
    Execute python code in a temporary subprocess sandbox inside the `.sandbox` directory.
    This is highly useful for data analysis, complex calculations, and visualization (like generating charts using matplotlib).

    If you generate charts or figures (using matplotlib, seaborn, etc.), save them as a PNG file in the current directory (e.g. `plt.savefig('my_chart.png')`).
    Do NOT use directory traversal (`..`) or absolute paths in your code.
    The system will automatically detect the PNG file, move it to the web uploads folder, and return the correct markdown link.

    Args:
        code: The complete python code string to execute.
    """
    is_safe, reason = is_code_safe(code)
    if not is_safe:
        return f"Execution Blocked by Guardrails:\n{reason}"

    sandbox_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".sandbox"))
    os.makedirs(sandbox_dir, exist_ok=True)

    gitignore_path = os.path.join(sandbox_dir, ".gitignore")
    if not os.path.exists(gitignore_path):
        try:
            with open(gitignore_path, 'w') as f_git:
                f_git.write("# Ignore all files in this sandbox directory\n*\n!.gitignore\n")
        except Exception:
            pass

    try:
        initial_pngs = {f for f in os.listdir(sandbox_dir) if f.endswith('.png')}
    except Exception:
        initial_pngs = set()

    temp_filename = f"sandbox_run_{uuid.uuid4().hex[:8]}.py"
    temp_file_path = os.path.join(sandbox_dir, temp_filename)

    try:
        with open(temp_file_path, 'w', encoding='utf-8') as f:
            full_code = (
                "import pandas as pd\n"
                "import numpy as np\n"
                "import matplotlib.pyplot as plt\n"
                "\n" + code
            )
            f.write(full_code)

        result = subprocess.run(
            [sys.executable, temp_file_path],
            cwd=sandbox_dir,
            capture_output=True,
            text=True,
            timeout=30
        )

        try:
            final_pngs = {f for f in os.listdir(sandbox_dir) if f.endswith('.png')}
        except Exception:
            final_pngs = set()

        new_pngs = final_pngs - initial_pngs

        uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "web", "uploads"))
        os.makedirs(uploads_dir, exist_ok=True)

        generated_charts = []
        for png in new_pngs:
            src_path = os.path.join(sandbox_dir, png)
            new_filename = f"chart_{uuid.uuid4().hex[:12]}.png"
            dest_path = os.path.join(uploads_dir, new_filename)

            try:
                import shutil
                shutil.copy2(src_path, dest_path)
                generated_charts.append(f"![Chart](/uploads/{new_filename})")
            except Exception:
                pass

        output_parts = []
        if result.stdout:
            output_parts.append(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            output_parts.append(f"STDERR:\n{result.stderr}")

        if generated_charts:
            charts_str = "\n".join(generated_charts)
            output_parts.append(f"GENERATED CHARTS:\n{charts_str}\nYou can use these markdown image links in your response to show the chart to the user.")

        if not output_parts:
            return "Execution completed successfully with no output (empty stdout/stderr)."

        return "\n\n".join(output_parts)
    except subprocess.TimeoutExpired:
        return "Execution Error: Timeout expired (limit 30 seconds)."
    except Exception as e:
        return f"Execution Error: {str(e)}"
    finally:
        pass


@function_tool
def list_rag_documents() -> str:
    """
    List all uploaded PDF reference documents available in the RAG library.
    Use this to see what document references are available when the user asks about uploaded files, PDFs, recipes, or reference materials.
    """
    try:
        from models.engine import engine
        from sqlmodel import Session
        from modules.documents import methods as doc_methods
        
        with Session(engine) as session:
            docs = doc_methods.list_documents(session)
            
        return json.dumps([
            {
                "id": doc.id,
                "name": doc.name,
                "status": doc.status,
                "total_pages": doc.total_pages,
                "uploaded_at": doc.uploaded_at
            }
            for doc in docs
        ], default=str)
    except Exception as e:
        return tool_error("list_documents_failed", str(e))


@function_tool
def search_rag_documents(query: str, document_id: str | None = None, n_results: int = 5) -> str:
    """
    Search the RAG database for relevant paragraphs/context chunks matching a query.
    You can optionally filter by a specific document_id if the user mentioned a specific document.
    Use this when the user asks a question about the contents of a PDF, document, or recipes.

    Args:
        query: The search term or question to query.
        document_id: Optional ID of the document to limit search to.
        n_results: Maximum number of relevant paragraphs to retrieve (default is 5).
    """
    try:
        from modules.queries import methods as query_methods
        from modules.queries.schema import QueryRequest
        
        req = QueryRequest(query=query, document_id=document_id, n_results=n_results)
        res = query_methods.search_chunks(req)
        
        output = []
        for hit in res.hits:
            output.append(
                f"Document: {hit.document_name} (ID: {hit.document_id})\n"
                f"Page: {hit.page_number + 1}\n"
                f"Similarity Distance: {hit.distance:.4f}\n"
                f"Content:\n{hit.text}\n"
            )
            
        if not output:
            return tool_error("no_results", "No relevant paragraphs found in RAG database.")

        return "\n---\n".join(output)
    except Exception as e:
        return tool_error("rag_search_failed", str(e))


def _rrf_fuse(
    semantic_hits: list[tuple[str, dict, float]],
    bm25_hits: list[tuple[str, float]],
    top_k: int,
    k: int = 60,
) -> list[tuple[str, dict, float]]:
    """Reciprocal Rank Fusion: combine semantic + BM25 rankings into one ranked list."""
    # Build lookup: text → metadata (from semantic hits)
    meta_map: dict[str, dict] = {text: meta for text, meta, _ in semantic_hits}

    # Semantic rank scores
    sem_rank: dict[str, float] = {text: 1.0 / (k + i + 1) for i, (text, _, _) in enumerate(semantic_hits)}

    # BM25 rank scores
    bm25_rank: dict[str, float] = {text: 1.0 / (k + i + 1) for i, (text, _) in enumerate(bm25_hits)}

    # Union of all texts
    all_texts = set(sem_rank) | set(bm25_rank)
    fused = {t: sem_rank.get(t, 0.0) + bm25_rank.get(t, 0.0) for t in all_texts}

    ranked = sorted(fused.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [(text, meta_map.get(text, {}), score) for text, score in ranked]


def _hybrid_search_collection(collection, query: str, n_results: int) -> list[tuple[str, dict, float]]:
    """Pull candidates from ChromaDB then re-rank with BM25, fuse via RRF."""
    from modules.rag.methods import BM25Retriever

    candidate_k = min(n_results * 4, 50)
    try:
        raw = collection.query(
            query_texts=[query],
            n_results=candidate_k,
            include=["documents", "metadatas", "distances"],
        )
    except Exception:
        return []

    docs = (raw.get("documents") or [[]])[0]
    metas = (raw.get("metadatas") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]

    if not docs:
        return []

    semantic_hits = list(zip(docs, metas, dists))

    bm25 = BM25Retriever(docs)
    bm25_hits = bm25.retrieve(query, top_k=candidate_k)

    return _rrf_fuse(semantic_hits, bm25_hits, top_k=n_results)


@function_tool
def search_knowledge(query: str, n_results: int = 5) -> str:
    """
    Search across all user knowledge: uploaded RAG documents and indexed notes.
    Always use this when the user asks about their content, notes, or documents.
    Uses hybrid search (semantic + BM25) with Reciprocal Rank Fusion for better accuracy.

    Args:
        query: The search term or question.
        n_results: Max results per source (default 5).
    """
    from utils.chroma import chroma_lock, get_collection, get_notes_collection

    output = []

    # Search RAG documents (documents_v2) — hybrid
    try:
        with chroma_lock:
            doc_hits = _hybrid_search_collection(get_collection(), query, n_results)
        for text, meta, score in doc_hits:
            output.append(
                f"[Source: Document — {meta.get('document_name', 'Unknown')}, "
                f"Page {meta.get('page_number', 0) + 1}, Score: {score:.4f}]\n{text}"
            )
    except Exception as e:
        output.append(f"[Document search error: {e}]")

    # Search indexed notes (note_pages) — hybrid
    try:
        with chroma_lock:
            note_hits = _hybrid_search_collection(get_notes_collection(), query, n_results)
        for text, meta, score in note_hits:
            output.append(
                f"[Source: Note — \"{meta.get('note_title', 'Untitled')}\", "
                f"Score: {score:.4f}]\n{text}"
            )
    except Exception as e:
        output.append(f"[Note search error: {e}]")

    if not output:
        return tool_error("no_results", "No relevant results found in documents or notes.")

    return "\n\n---\n\n".join(output)


# ── User memory tools ────────────────────────────────────────────────────────

@function_tool
async def remember_user_fact(ctx: RunContextWrapper[dict], key: str, value: str) -> str:
    """
    Save a persistent fact about this user that will be remembered across all future sessions.
    Use this when the user shares preferences, context, or important personal info
    (e.g. preferred language, job role, ongoing projects, recurring topics).

    Args:
        key: Short label for the fact (e.g. "preferred_language", "job_role", "current_project").
        value: The fact to remember (e.g. "Indonesian", "software engineer", "building a notes app").
    """
    from modules.memory.methods import upsert_memory, ensure_table
    user_id = (ctx.context or {}).get("user_id") or "anonymous"
    try:
        await ensure_table()
        await upsert_memory(user_id, key, value)
        return f"Remembered: {key} = {value}"
    except Exception as e:
        return tool_error("memory_save_failed", str(e))


@function_tool
async def forget_user_fact(ctx: RunContextWrapper[dict], key: str) -> str:
    """
    Delete a previously saved fact about this user.

    Args:
        key: The key of the fact to forget.
    """
    from modules.memory.methods import delete_memory, ensure_table
    user_id = (ctx.context or {}).get("user_id") or "anonymous"
    try:
        await ensure_table()
        deleted = await delete_memory(user_id, key)
        return f"Forgot: {key}" if deleted else f"No memory found for key: {key}"
    except Exception as e:
        return tool_error("memory_delete_failed", str(e))


# ── Skill tools ───────────────────────────────────────────────────────────────

@function_tool
async def load_skill(name: str) -> str:
    """Muat instruksi lengkap sebuah skill dari katalog "AVAILABLE SKILLS".

    Panggil ini SETELAH melihat skill yang relevan di katalog dan SEBELUM
    mengerjakan tugas, lalu ikuti instruksi skill tersebut.

    Args:
        name: slug/nama skill persis seperti tertera di katalog "AVAILABLE SKILLS".
    """
    from modules.skills.methods import get_skill_content
    content = await get_skill_content(name)
    if not content:
        return tool_error("skill_not_found", f"Skill '{name}' tidak ditemukan atau nonaktif.")
    return content


# ── Wiki tools ────────────────────────────────────────────────────────────────

@function_tool
async def query_wiki(ctx: RunContextWrapper[dict], query: str) -> str:
    """Search the wiki knowledge base for information compiled from ingested notes.

    Use this when the user asks about topics that may have been previously covered
    in notes that were ingested into the wiki. Returns the most relevant wiki pages
    with excerpts, ranked by BM25 relevance score.

    Args:
        query: A search query or question to look up in the wiki.
    """
    try:
        from core.database import AsyncSessionLocal
        from modules.wiki import methods as wiki_methods

        async with AsyncSessionLocal() as db:
            results = await wiki_methods.search_wiki_pages(db, query)

        if not results:
            return tool_error("no_results", f"No wiki pages found matching '{query}'.")

        output_parts = [f"Wiki search results for: **{query}**\n"]
        for i, r in enumerate(results[:8], 1):
            output_parts.append(
                f"{i}. **{r['title']}** (`{r['slug']}`) [{r['category']}]\n"
                f"   Score: {r['score']} | Excerpt: {r['excerpt']}"
            )
        return "\n".join(output_parts)
    except Exception as e:
        return tool_error("wiki_search_failed", str(e))


@function_tool
async def ingest_note_to_wiki(
    ctx: RunContextWrapper[dict],
    note_id: str,
    note_title: str,
    note_content: str,
) -> str:
    """Process and integrate a note into the persistent wiki knowledge base.

    Runs the WikiIngestAgent which automatically:
    - Creates a summary page for the note
    - Creates or updates entity pages (people, orgs, projects)
    - Creates or updates concept pages (ideas, themes)
    - Cross-links pages using [[WikiLink]] syntax

    Use this when the user asks to "add to wiki", "save to wiki", or "remember this".

    Args:
        note_id: The unique ID of the note to ingest.
        note_title: The title of the note.
        note_content: The full text or HTML content of the note.
    """
    try:
        from agents import Runner
        from core.database import AsyncSessionLocal
        from modules.wiki.agent import wiki_ingest_agent
        from modules.wiki import methods as wiki_methods

        agent_input = (
            f"Ingest the following note into the wiki.\n\n"
            f"**Note ID:** {note_id}\n"
            f"**Note Title:** {note_title}\n\n"
            f"## Note Content\n\n{note_content}"
        )

        result = await Runner.run(
            wiki_ingest_agent,
            agent_input,
            context={"note_id": note_id, "note_title": note_title},
            max_turns=30,
        )

        agent_summary = result.final_output or "Wiki ingest completed."

        # Fetch the most recent ingest log for this note to report counts
        async with AsyncSessionLocal() as db:
            recent_logs = await wiki_methods.get_wiki_log(db)

        matching = next((lg for lg in recent_logs if lg.note_id == note_id), None)
        if matching:
            import json as _json
            created = _json.loads(matching.pages_created or "[]")
            updated = _json.loads(matching.pages_updated or "[]")
            return (
                f"✓ Wiki ingest complete for **{note_title}**.\n"
                f"  Pages created: {len(created)} ({', '.join(created) or 'none'})\n"
                f"  Pages updated: {len(updated)} ({', '.join(updated) or 'none'})\n"
                f"  Summary: {agent_summary}"
            )

        return f"✓ Wiki ingest complete for **{note_title}**.\n  {agent_summary}"
    except Exception as e:
        return tool_error("wiki_ingest_failed", str(e))


@function_tool
async def read_wiki_index(ctx: RunContextWrapper[dict]) -> str:
    """Browse the full wiki index organised by category.

    Returns a Markdown-formatted listing of all wiki pages grouped by category
    (summary, entity, concept, synthesis, etc.). Use this when the user wants
    an overview of the accumulated knowledge wiki.
    """
    try:
        from core.database import AsyncSessionLocal
        from modules.wiki import methods as wiki_methods

        async with AsyncSessionLocal() as db:
            index = await wiki_methods.get_wiki_index(db)

        if not index:
            return "The wiki is currently empty — no pages have been ingested yet."

        lines = ["# Wiki Index\n"]
        category_order = ["summary", "entity", "concept", "synthesis", "index", "log"]
        all_cats = list(index.keys())
        ordered_cats = [c for c in category_order if c in all_cats] + sorted(
            c for c in all_cats if c not in category_order
        )

        total = sum(len(v) for v in index.values())
        lines.append(f"**Total pages:** {total}\n")

        for cat in ordered_cats:
            entries = index[cat]
            lines.append(f"\n## {cat.capitalize()} ({len(entries)})")
            for entry in entries:
                tags_str = ", ".join(entry["tags"]) if entry["tags"] else "—"
                lines.append(
                    f"- **{entry['title']}** (`{entry['slug']}`) — tags: {tags_str}"
                )

        return "\n".join(lines)
    except Exception as e:
        return tool_error("wiki_index_failed", str(e))

