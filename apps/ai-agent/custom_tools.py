import asyncio
import json
import sqlite3
import time
import uuid
from urllib.parse import urljoin, urlparse
import httpx
from lxml import html
from ddgs import DDGS
from agents import function_tool, RunContextWrapper
import subprocess
import sys
import os
import tempfile
import ast

def format_as_tiptap(text: str) -> str:
    """Check if the text is already JSON. If not, wrap it in standard TipTap format."""
    if not text:
        return json.dumps({"type": "doc", "content": []})
    try:
        json.loads(text)
        return text
    except ValueError:
        pass
    
    lines = text.split("\n")
    paragraphs = []
    for line in lines:
        if line.strip() or not paragraphs:
            paragraphs.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": line}]
            })
    tiptap_doc = {
        "type": "doc",
        "content": paragraphs
    }
    return json.dumps(tiptap_doc)

@function_tool
def write_notes(
    ctx: RunContextWrapper[dict],
    title: str,
    content: str,
    note_id: str | None = None
) -> str:
    """
    Propose creating a new note or updating an existing note. This action requires user approval.

    Args:
        ctx: Run context containing user session details.
        title: The proposed title of the note.
        content: The proposed text content of the note (raw text or TipTap JSON format).
        note_id: Optional ID of the note to update.
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

    Args:
        ctx: Run context containing user session details.
        title: The new title for the note.
        content: The new text content for the note (raw text or TipTap JSON format).
    """
    formatted_content = format_as_tiptap(content)
    target_id = ctx.context.get("session_id") if ctx.context else None
    return json.dumps({
        "status": "pending_approval",
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
    # 1. Quick regex/string check for high-risk system commands or files
    blocked_keywords = [
        "docker", "docker-compose", "rm -rf", "rmdir", "chmod", "chown", 
        ".env", "sessions.db", "config.json", "/etc/", ".ssh", "id_rsa", 
        "authorized_keys", "eval(", "exec(", "shutil.rmtree", "os.system",
        "os.remove", "os.unlink", "os.rmdir", "os.popen", "subprocess.run"
    ]
    code_lower = code.lower()
    for kw in blocked_keywords:
        if kw in code_lower:
            return False, f"Security Block: Blocked keyword or command pattern detected: '{kw}'"
            
    # 2. Parse code using Python's AST (Abstract Syntax Tree) to inspect imports, calls, and attributes
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
        # Check imports: `import module`
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_module = alias.name.split('.')[0]
                if root_module in blocked_modules:
                    return False, f"Security Block: Import of module '{root_module}' is strictly prohibited."
        # Check imports: `from module import ...`
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root_module = node.module.split('.')[0]
                if root_module in blocked_modules:
                    return False, f"Security Block: Import from module '{root_module}' is strictly prohibited."
                    
        # Check function calls: prevent eval, exec, open, compile, etc.
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
                if func_name in ["eval", "exec", "compile", "globals", "locals", "getattr", "setattr", "__import__"]:
                    return False, f"Security Block: Calling standard function '{func_name}' is strictly prohibited."
            
            # Check attribute access on modules (e.g. `system`, `popen`, `run`)
            elif isinstance(node.func, ast.Attribute):
                if node.func.attr in ["eval", "exec", "system", "popen", "run", "spawn", "fork", "remove", "unlink", "rmdir", "rmtree"]:
                    return False, f"Security Block: Invoking attribute/method '{node.func.attr}' is strictly prohibited."
                    
        # Check all string constants in the code to block path traversal or accessing sensitive files
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            val = node.value.lower()
            # Block any traversal using .. or absolute paths or sensitive filenames
            if ".." in val or ".env" in val or "sessions.db" in val or ".ssh" in val or "/etc/" in val:
                return False, f"Security Block: File path/value '{node.value}' contains restricted keywords or directory traversal."
                    
    return True, "Code is safe."

@function_tool
def execute_python_code(code: str) -> str:
    """
    Execute python code in a temporary subprocess sandbox inside the `.sandbox` directory.
    This is highly useful for data analysis, complex calculations, and visualization (like generating charts using matplotlib).
    
    If you generate charts or figures (using matplotlib, seaborn, etc.), you MUST save them as PNG files in the static uploads folder:
    `../../web/uploads/chart_<random_uuid>.png`
    and return the markdown image link `![Chart](/uploads/chart_<random_uuid>.png)` in your response so the user can see the chart.
    
    Args:
        code: The complete python code string to execute.
    """
    # Run code safety check through static analysis guardrail
    is_safe, reason = is_code_safe(code)
    if not is_safe:
        return f"Execution Blocked by Guardrails:\n{reason}"

    # Define sandbox directory inside apps/ai-agent/.sandbox
    sandbox_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".sandbox"))
    os.makedirs(sandbox_dir, exist_ok=True)
    
    # Ensure a .gitignore file exists inside .sandbox so git ignores everything inside it
    gitignore_path = os.path.join(sandbox_dir, ".gitignore")
    if not os.path.exists(gitignore_path):
        try:
            with open(gitignore_path, 'w') as f_git:
                f_git.write("# Ignore all files in this sandbox directory\n*\n!.gitignore\n")
        except Exception:
            pass

    # Create temporary script file inside the sandbox directory
    temp_filename = f"sandbox_run_{uuid.uuid4().hex[:8]}.py"
    temp_file_path = os.path.join(sandbox_dir, temp_filename)
    
    try:
        # Write the code to the sandbox script file
        with open(temp_file_path, 'w', encoding='utf-8') as f:
            # Pre-import common data libraries to make it easier for the agent
            # Note: We do NOT pre-import sys or os anymore to minimize the execution scope!
            full_code = (
                "import pandas as pd\n"
                "import numpy as np\n"
                "import matplotlib.pyplot as plt\n"
                "\n" + code
            )
            f.write(full_code)
            
        # Run the script using subprocess inside the sandbox directory
        # Set cwd to sandbox_dir so all relative paths inside user code are sandbox-scoped
        result = subprocess.run(
            [sys.executable, temp_file_path],
            cwd=sandbox_dir,
            capture_output=True,
            text=True,
            timeout=30 # 30 seconds limit
        )
        
        output_parts = []
        if result.stdout:
            output_parts.append(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            output_parts.append(f"STDERR:\n{result.stderr}")
            
        if not output_parts:
            return "Execution completed successfully with no output (empty stdout/stderr)."
            
        return "\n\n".join(output_parts)
    except subprocess.TimeoutExpired:
        return "Execution Error: Timeout expired (limit 30 seconds)."
    except Exception as e:
        return f"Execution Error: {str(e)}"
    finally:
        # Clean up the script file inside the sandbox
        try:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        except Exception:
            pass
