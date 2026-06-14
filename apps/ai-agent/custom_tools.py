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
