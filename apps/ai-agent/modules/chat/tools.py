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
            return f"No results found for query: {query}"

        output = []
        for r in results:
            output.append(f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}\n")
        return "\n---\n".join(output)
    except Exception as e:
        return f"Error performing web search: {str(e)}"


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
            return f"No photos found for query: {query}"

        output = []
        for idx, r in enumerate(results, 1):
            title = r.get("title", f"Image {idx}")
            img_url = r.get("image")
            page_url = r.get("url")
            if img_url:
                output.append(f"Title: {title}\nImage URL: {img_url}\nPage URL: {page_url}\n")
        return "\n---\n".join(output)
    except Exception as e:
        return f"Error performing photo search: {str(e)}"


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
            return f"No YouTube videos found for query: {query}"

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
        return f"Error performing YouTube search: {str(e)}"


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
            return f"Could not extract content from URL: {url}"
        return f"URL: {res.get('url')}\n\nContent:\n{res.get('content')}"
    except Exception as e:
        return f"Error extracting web content: {str(e)}"


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
        return f"Error crawling website: {str(e)}"


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
        return f"Error listing RAG documents: {str(e)}"


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
            return "No relevant paragraphs found in RAG database."
            
        return "\n---\n".join(output)
    except Exception as e:
        return f"Error searching RAG documents: {str(e)}"

