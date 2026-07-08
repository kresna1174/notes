import asyncio
import os
import random
import re
import uuid
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

# Inisialisasi Logger
logger = logging.getLogger("ai-agent")
logger.setLevel(logging.INFO)

# Hindari duplikasi handler jika modul di-reload
if not logger.handlers:
    # Handler untuk menulis ke file
    log_path = os.path.join(os.getenv("LOG_DIR", "."), "ai_agent.log")
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.INFO)

    # Handler untuk mencetak ke terminal
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    # Format tampilan log
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # Hubungkan handler ke logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import json
from openai.types.responses import (
    ResponseReasoningTextDeltaEvent,
    ResponseTextDeltaEvent,
)

# Import SQLAlchemy config dan models
from core.database import engine, Base, get_db
from core.models import SubAgentTask

# Import OpenAI Agents SDK
from agents import Agent, Runner, ToolCallItem, ToolCallOutputItem
from agents.extensions.memory import SQLAlchemySession

# Inisialisasi LLM Client (OpenRouter)
import core.llm
from core.llm import get_model


# Setup lifespan untuk inisialisasi DB di startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Membuat tabel-tabel kustom jika belum ada di database sessions.db
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup engine di shutdown
    await engine.dispose()

from scalar_fastapi import get_scalar_api_reference

app = FastAPI(
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

@app.get("/docs", include_in_schema=False)
async def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title="AI Agent API Reference",
    )


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    user_id: str | None = None

class ChatAttachment(BaseModel):
    filename: str
    mimeType: str
    filePath: str

class ChatStreamRequest(BaseModel):
    message: str | None = None
    messages: list[dict] | None = None
    session_id: str = "default"
    note_title: str | None = None
    note_content: str | None = None
    user_id: str | None = None
    attachments: list[ChatAttachment] | None = None

class SummarizeRequest(BaseModel):
    content: str
    session_id: str = "default"
    user_id: str | None = None

class TagsRequest(BaseModel):
    content: str
    session_id: str = "default"
    user_id: str | None = None

class ApproveRejectRequest(BaseModel):
    session_id: str
    call_id: str
    status: str

from custom_tools import write_notes, create_new_note, update_note_direct, search_web, extract_web, crawl_web, execute_python_code, find_web_photos, find_youtube_videos
from core.llm import default_model_settings

# 1. Definisikan Sub-Agents
summarizer_sub_agent = Agent(
    name="SummarizerSubAgent",
    instructions="You are a specialized sub-agent that summarizes note content. Provide a concise, bullet-pointed summary.",
    model=get_model(),
    model_settings=default_model_settings,
    tools=[write_notes, create_new_note, update_note_direct, search_web, extract_web, crawl_web]
)

tagger_sub_agent = Agent(
    name="TaggerSubAgent",
    instructions="You are a specialized sub-agent that extracts 3 to 5 relevant tags from the content. Return ONLY a comma-separated list of tags.",
    model=get_model(),
    model_settings=default_model_settings,
    tools=[write_notes, create_new_note, update_note_direct, search_web, extract_web, crawl_web]
)

# 2. Definisikan Parent Agent dengan Sub-Agents sebagai Tools
parent_agent = Agent(
    name="NotesParentAssistant",
    instructions="""You are a helpful notes platform assistant.
    You help the user summarize notes, categorize notes, and answer questions.
    For advanced summarization or tag extraction tasks, delegate to your specialized sub-agents using their tools.
    You can also search the web, extract content, crawl sites, write/update notes, create brand new notes, directly update active notes without approval, and execute python code to analyze data or generate charts.
    
    If the user asks you to analyze some data or plot a chart (and you have an uploaded file or data), write python code and run it using the `execute_python_code` tool.
    If you generate charts or figures (using matplotlib, seaborn, etc.), save them as a PNG file in the current directory (e.g. `plt.savefig('chart.png')`). Do NOT use directory traversal (`..`) or absolute paths in your code as they are blocked by guardrails. The system will automatically detect the PNG file, move it to the web uploads folder, and provide the correct markdown image link (e.g., `![Chart](/uploads/chart_<uuid>.png)`) in the tool output for you to include in your final response.

    If the user asks you to fetch or search for a photo or image on the web and embed/insert it in the note:
    1. Search for relevant photos using the `find_web_photos` tool.
    2. Choose the best matching image URL.
    3. Construct a standard HTML image tag: <img src="IMAGE_URL" alt="Description" /> or markdown image: ![Description](IMAGE_URL). Include it in the proposed note content and write/update the note using `write_notes` or `update_note_direct`.

    If the user asks you to fetch or search for a video from YouTube and embed/insert it in the note:
    1. Search for relevant YouTube videos using the `find_youtube_videos` tool.
    2. Choose the best matching video/embed URL.
    3. Construct a YouTube embed iframe wrapped in a div: <div data-youtube-video><iframe src="EMBED_URL_OR_VIDEO_URL"></iframe></div> or simply write the video URL inside the note. The editor is configured with @tiptap/extension-youtube to parse and render it as a video component. Include it in the proposed note content and write/update the note using `write_notes` or `update_note_direct`.

    CRITICAL: If the user asks you to edit, translate, or refine a selected block of text (indicated by "Teks yang dipilih/diblok: ..." or "Teks/HTML yang dipilih/diblok: ..."), you MUST return ONLY the final translated, corrected, or summarized text.
    - Do NOT wrap your response in markdown code blocks (e.g. ```text ... ```).
    - Do NOT include any introductory sentences (like "Berikut adalah terjemahannya:", "Ini hasil perbaikannya:", etc.).
    - Do NOT include any explanations, comparisons, or conversational greetings/closing remarks.
    - Output ONLY the raw result of the requested operation directly.
    - If the input contains HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.), you MUST preserve these HTML tags in the correct positions within the translated or refined text.
    """,
    model=get_model(),
    model_settings=default_model_settings,
    tools=[
        summarizer_sub_agent.as_tool(
            tool_name="summarize_expert",
            tool_description="Use for summarizing notes or text content.",
        ),
        tagger_sub_agent.as_tool(
            tool_name="tagger_expert",
            tool_description="Use for extracting tags or keywords from notes or text content.",
        ),
        write_notes,
        create_new_note,
        update_note_direct,
        search_web,
        extract_web,
        crawl_web,
        execute_python_code,
        find_web_photos,
        find_youtube_videos,
    ]
)


def normalize_content(content) -> str:
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            parts.append(normalize_content(part))
        return "".join(parts)
    if isinstance(content, dict):
        text_val = content.get("text")
        if isinstance(text_val, dict):
            return text_val.get("value", "")
        elif isinstance(text_val, str):
            return text_val
        if "value" in content:
            return content.get("value")
        return str(content)
    
    if hasattr(content, "text"):
        text_attr = content.text
        if hasattr(text_attr, "value"):
            return text_attr.value
        elif isinstance(text_attr, str):
            return text_attr
    if hasattr(content, "value"):
        return content.value
    return str(content)


@app.post("/api/chat")
async def chat(request: ChatRequest):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")
    try:
        # Load persistent conversational memory dari SQLAlchemySession
        session = SQLAlchemySession.from_url(
            session_id=request.session_id,
            url=db_url,
            create_tables=True,
        )
        
        # Jalankan agent dengan session memory
        context = {"session_id": request.session_id, "user_id": request.user_id}
        result = await Runner.run(parent_agent, request.message, session=session, context=context, max_turns=50)
        
        return {
            "response": normalize_content(result.final_output),
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process chat: {str(e)}")


def sse(payload: dict):
    return f"data: {json.dumps(payload)}\n\n"

def vercel_data(payload):
    """Vercel AI Data Stream Protocol — type 2 (data part)."""
    return f"2:{json.dumps([payload])}\n"


def safe_jsonable(value):
    return json.loads(json.dumps(value, default=str))


async def chat_event_generator(message: str, session_id: str, user_id: str | None = None):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")

    active_agent = "NotesParentAssistant"
    active_tool_names = {}
    current_reasoning_id = None
    current_text_id = None
    text_open = False

    try:
        session = SQLAlchemySession.from_url(
            session_id=session_id,
            url=db_url,
            create_tables=True,
        )

        message_id = f"message_{uuid.uuid4().hex}"
        yield sse({"type": "start", "messageId": message_id})
        yield sse({"type": "start-step"})

        context = {"session_id": session_id, "user_id": user_id}
        result = Runner.run_streamed(
            parent_agent,
            message,
            session=session,
            context=context,
            max_turns=50,
        )

        event_iterator = result.stream_events().__aiter__()
        next_event_task = asyncio.create_task(event_iterator.__anext__())

        while True:
            done, _ = await asyncio.wait(
                {next_event_task},
                timeout=8,
                return_when=asyncio.FIRST_COMPLETED,
            )

            # Ini heartbeat yang benar:
            # tetap terkirim walaupun tool call / stream event sedang diam.
            if not done:
                yield ": ping\n\n"
                continue

            try:
                event = next_event_task.result()
            except StopAsyncIteration:
                break

            next_event_task = asyncio.create_task(event_iterator.__anext__())

            logger.info(f"Stream Event: type={event.type}")

            if event.type == "agent_updated_stream_event":
                logger.info(f"  -> Agent transitioned: {event.new_agent.name}")

                new_agent = event.new_agent.name

                if new_agent != active_agent:
                    active_agent = new_agent

                    if active_agent != "NotesParentAssistant":
                        if text_open:
                            yield sse({"type": "text-end", "id": current_text_id})
                            text_open = False
                            current_text_id = None

                        if current_reasoning_id:
                            yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                            current_reasoning_id = None

                        current_reasoning_id = f"reasoning_{uuid.uuid4().hex}"
                        yield sse({"type": "reasoning-start", "id": current_reasoning_id})
                        yield sse({
                            "type": "reasoning-delta",
                            "id": current_reasoning_id,
                            "delta": f"[Subagent: {active_agent}]\n",
                        })

                    else:
                        if current_reasoning_id:
                            yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                            current_reasoning_id = None

                        # Jangan langsung buka text-start di sini.
                        # Buka hanya saat ResponseTextDeltaEvent benar-benar datang.

            elif event.type == "raw_response_event":
                data = event.data
                logger.info(f"  -> Raw response event: data_class={data.__class__.__name__}")

                # Capture actual token usage from completed response events
                if data.__class__.__name__ == "ResponseCompletedEvent":
                    resp = getattr(data, "response", None)
                    if resp and hasattr(resp, "usage") and resp.usage:
                        usage = resp.usage
                        input_toks = getattr(usage, "input_tokens", 0) or getattr(usage, "prompt_tokens", 0) or 0
                        output_toks = getattr(usage, "output_tokens", 0) or getattr(usage, "completion_tokens", 0) or 0
                        total_toks = getattr(usage, "total_tokens", 0) or (input_toks + output_toks)
                        
                        logger.info(f"YIELDING ACTUAL USAGE: input={input_toks}, output={output_toks}, total={total_toks}")
                        yield vercel_data({
                            "type": "usage",
                            "promptTokens": input_toks,
                            "completionTokens": output_toks,
                        })

                if hasattr(data, "delta") and data.delta:
                    delta_clean = data.delta.replace("\n", "\\n")
                    if len(delta_clean) > 50:
                        delta_clean = delta_clean[:50] + "..."
                    logger.info(f"     Delta: {delta_clean}")

                if isinstance(data, ResponseReasoningTextDeltaEvent):
                    if text_open:
                        yield sse({"type": "text-end", "id": current_text_id})
                        text_open = False
                        current_text_id = None

                    if not current_reasoning_id:
                        current_reasoning_id = f"reasoning_{uuid.uuid4().hex}"
                        yield sse({"type": "reasoning-start", "id": current_reasoning_id})
                        yield sse({
                            "type": "reasoning-delta",
                            "id": current_reasoning_id,
                            "delta": f"[Subagent: {active_agent}]\n",
                        })

                    yield sse({
                        "type": "reasoning-delta",
                        "id": current_reasoning_id,
                        "delta": data.delta,
                    })

                elif isinstance(data, ResponseTextDeltaEvent):
                    if active_agent != "NotesParentAssistant":
                        if text_open:
                            yield sse({"type": "text-end", "id": current_text_id})
                            text_open = False
                            current_text_id = None

                        if not current_reasoning_id:
                            current_reasoning_id = f"reasoning_{uuid.uuid4().hex}"
                            yield sse({"type": "reasoning-start", "id": current_reasoning_id})
                            yield sse({
                                "type": "reasoning-delta",
                                "id": current_reasoning_id,
                                "delta": f"[Subagent: {active_agent}]\n",
                            })

                        yield sse({
                            "type": "reasoning-delta",
                            "id": current_reasoning_id,
                            "delta": data.delta,
                        })

                    else:
                        if current_reasoning_id:
                            yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                            current_reasoning_id = None

                        if not text_open:
                            current_text_id = f"text_{uuid.uuid4().hex}"
                            yield sse({"type": "text-start", "id": current_text_id})
                            text_open = True

                        yield sse({
                            "type": "text-delta",
                            "id": current_text_id,
                            "delta": data.delta,
                        })

            elif event.type == "run_item_stream_event":
                item = event.item

                logger.info(f"  -> run_item type: {item.__class__.__name__}, call_id={getattr(item, 'call_id', 'N/A')}, tool_name={getattr(item, 'tool_name', 'N/A')}")

                if isinstance(item, ToolCallItem):
                    if text_open:
                        yield sse({"type": "text-end", "id": current_text_id})
                        text_open = False
                        current_text_id = None

                    if current_reasoning_id:
                        yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                        current_reasoning_id = None

                    active_tool_names[item.call_id] = item.tool_name

                    args_dict = {}

                    if hasattr(item, "raw_item") and hasattr(item.raw_item, "arguments"):
                        args_str = item.raw_item.arguments

                        if isinstance(args_str, str):
                            try:
                                args_dict = json.loads(args_str)
                            except Exception:
                                args_dict = {"raw_arguments": args_str}
                        elif isinstance(args_str, dict):
                            args_dict = args_str

                    yield sse({
                        "type": "tool-input-available",
                        "toolCallId": item.call_id,
                        "toolName": item.tool_name,
                        "input": safe_jsonable(args_dict),
                    })

                elif isinstance(item, ToolCallOutputItem):
                    if text_open:
                        yield sse({"type": "text-end", "id": current_text_id})
                        text_open = False
                        current_text_id = None

                    if current_reasoning_id:
                        yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                        current_reasoning_id = None

                    tool_name = active_tool_names.pop(item.call_id, None)

                    if not tool_name:
                        if hasattr(item, "tool_origin") and item.tool_origin:
                            tool_name = getattr(item.tool_origin, "agent_tool_name", None)

                    if not tool_name:
                        tool_name = "unknown_tool"

                    output_val = item.output

                    if isinstance(output_val, str):
                        try:
                            output_val = json.loads(output_val)
                        except Exception:
                            pass

                    yield sse({
                        "type": "tool-output-available",
                        "toolCallId": item.call_id,
                        "output": safe_jsonable(output_val),
                    })

        if current_reasoning_id:
            yield sse({"type": "reasoning-end", "id": current_reasoning_id})

        if text_open:
            yield sse({"type": "text-end", "id": current_text_id})

        yield sse({"type": "finish-step"})
        yield sse({"type": "finish"})
        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.exception("Chat stream failed")

        if current_reasoning_id:
            yield sse({"type": "reasoning-end", "id": current_reasoning_id})

        if text_open:
            yield sse({"type": "text-end", "id": current_text_id})

        yield sse({"type": "error", "errorText": str(e)})
        yield sse({"type": "finish-step"})
        yield sse({"type": "finish"})
        yield "data: [DONE]\n\n"


def parse_attachment(attachment: ChatAttachment) -> str:
    # Resolve the physical filepath.
    # Hono/Node uploads files to 'uploads/' relative to 'apps/web'
    # The relative path from 'apps/ai-agent' is '../web/uploads/'
    full_path = os.path.join("..", "web", attachment.filePath)
    
    if not os.path.exists(full_path):
        # Fallback: try filePath as-is
        full_path = attachment.filePath
        if not os.path.exists(full_path):
            return f"[Error: File {attachment.filename} not found on server]"
            
    ext = os.path.splitext(attachment.filename)[1].lower()
    
    try:
        if ext == '.pdf':
            import pypdf
            reader = pypdf.PdfReader(full_path)
            text_parts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"--- Page {i+1} ---\n{page_text}")
            return "\n\n".join(text_parts)
            
        elif ext in ['.csv', '.xlsx', '.xls']:
            import pandas as pd
            if ext == '.csv':
                df = pd.read_csv(full_path)
            else:
                df = pd.read_excel(full_path)
            # Render dataframe as markdown table
            return df.to_markdown(index=False)
            
        elif ext in ['.txt', '.md', '.json']:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
                
        elif ext in ['.png', '.jpg', '.jpeg', '.webp']:
            return f"[Image Attachment: {attachment.filename} uploaded at {attachment.filePath}]"
            
        else:
            return f"[Unsupported file type: {attachment.filename}]"
            
    except Exception as e:
        return f"[Error parsing file {attachment.filename}: {str(e)}]"

# ── Input Guardrail ─────────────────────────────────────────────────────────
# List of suspicious patterns that indicate a user is trying to extract
# sensitive files, credentials, env vars, or server internals.
_SENSITIVE_PATTERNS = [
    # .env / environment variables
    r"\.env", r"env\s+file", r"environment\s+variable", r"environtment",
    r"api[_\s]?key", r"secret[_\s]?key", r"private[_\s]?key", r"access[_\s]?token",
    r"bearer[_\s]?token", r"auth[_\s]?token", r"jwt[_\s]?secret",
    # Credentials / passwords
    r"password", r"passwd", r"credentials", r"database[_\s]?url",
    r"db[_\s]?pass", r"db[_\s]?password", r"connection[_\s]?string",
    # System / config files
    r"sessions?\.db", r"config\.json", r"/etc/passwd", r"/etc/shadow",
    r"id_rsa", r"\.ssh", r"authorized_keys", r"known_hosts",
    r"docker-compose", r"dockerfile",
    # Source code fishing
    r"source\s+code", r"show\s+me\s+your\s+code", r"baca\s+file",
    r"tampilkan\s+file", r"isi\s+file", r"lihat\s+file",
    r"buka\s+file", r"akses\s+file", r"read\s+file",
    r"cat\s+\.", r"ls\s+-", r"dir\s+/",
    # Prompt injection attempts
    r"ignore\s+(previous|all|prior)\s+instructions?",
    r"forget\s+(everything|your|all)",
    r"you\s+are\s+now", r"pretend\s+(you|to|that)",
    r"jailbreak", r"bypass", r"override\s+(your\s+)?instructions?",
    r"act\s+as\s+(if\s+you\s+are|a|an)\s+(?!notes|assistant|ai)",
    r"new\s+persona", r"roleplay\s+as",
    # RCE / shell command injection
    r"exec(ute)?\s+command", r"run\s+shell", r"terminal", r"bash",
    r"curl\s+", r"wget\s+", r"chmod\s+", r"rm\s+-",
]

# Random redirect topics shown inside the deflection message
_REDIRECT_TOPICS = [
    "cara membuat ringkasan catatan yang efektif",
    "perbedaan arsitektur monolith dan microservices",
    "tips produktivitas saat mencatat ide",
    "cara mengorganisasi catatan proyek",
    "teknik Zettelkasten untuk manajemen pengetahuan",
    "cara menulis dokumentasi teknis yang baik",
    "strategi belajar dengan spaced repetition",
    "cara membuat outline artikel yang menarik",
    "perbedaan antara SQL dan NoSQL database",
    "tips debugging kode Python yang efisien",
]

def _check_input_guardrail(message: str) -> str | None:
    """Return a deflection message string if message contains sensitive patterns, else None."""
    msg_lower = message.lower()
    for pattern in _SENSITIVE_PATTERNS:
        if re.search(pattern, msg_lower):
            topic = random.choice(_REDIRECT_TOPICS)
            return f"Saya tidak mengerti yang anda maksud. Tanyakan soal **{topic}** saja 😊"
    return None

# ────────────────────────────────────────────────────────────────────────────

@app.post("/api/chat/stream")
async def chat_stream(request: ChatStreamRequest):
    user_message = ""
    if request.message:
        user_message = request.message
    elif request.messages:
        # Ambil pesan terakhir dari history (format AI SDK)
        last_msg = request.messages[-1]
        content = last_msg.get("content", "")

        if isinstance(content, str) and content.strip():
            user_message = content.strip()
        elif isinstance(content, list):
            # Format lama: content = [{"type": "text", "text": "..."}]
            parts_text = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts_text.append(part.get("text", ""))
            user_message = "".join(parts_text)

        # Fallback: AI SDK v3/v6 sering kirim text di field 'parts', bukan 'content'
        if not user_message:
            parts = last_msg.get("parts", [])
            parts_text = []
            for part in parts:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts_text.append(part.get("text", ""))
            user_message = "".join(parts_text)

        logger.info(f"Extracted user_message: {user_message[:100]!r}")

    # ── Input Guardrail check ──────────────────────────────────────────────
    # Strip metadata tags before checking so legitimate filenames don't trigger
    _clean_for_check = re.sub(
        r'\[Isi Dokumen Terlampir:[^\]]+\]', '', user_message
    ).strip()
    _deflection = _check_input_guardrail(_clean_for_check)
    if _deflection:
        logger.warning(f"Input guardrail triggered for message: {user_message[:80]!r}")
        async def _blocked_stream():
            msg_id  = f"message_{uuid.uuid4().hex}"
            text_id = f"text_{uuid.uuid4().hex}"
            yield sse({"type": "start", "messageId": msg_id})
            yield sse({"type": "start-step"})
            yield sse({"type": "text-start", "id": text_id})
            yield sse({"type": "text-delta", "id": text_id, "delta": _deflection})
            yield sse({"type": "text-end", "id": text_id})
            yield sse({"type": "finish-step"})
            yield sse({"type": "finish"})
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            _blocked_stream(),
            media_type="text/event-stream",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )
    # ──────────────────────────────────────────────────────────────────────
            
    # Ekstrak file lampiran dan tambahkan ke context
    attachments_context = []
    
    # 1. Parse dari metadata tags di user_message string jika ada
    pattern = r'\[Isi Dokumen Terlampir:\s*\"([^\"]+)\"\s+filePath=\"([^\"]+)\"\s+mimeType=\"([^\"]+)\"\]'
    tag_matches = re.findall(pattern, user_message)
    for filename, filePath, mimeType in tag_matches:
        attachment = ChatAttachment(filename=filename, filePath=filePath, mimeType=mimeType)
        file_content = parse_attachment(attachment)
        attachments_context.append(
            f"[Isi Dokumen Terlampir: \"{filename}\"]\n"
            f"```{filename.split('.')[-1]}\n"
            f"{file_content}\n"
            f"```"
        )
        
    # Bersihkan metadata tags dari user_message agar tidak mengacaukan model
    if tag_matches:
        user_message = re.sub(pattern, '', user_message).strip()
        
    # 2. Parse dari request.attachments jika dilewatkan di request body
    if request.attachments:
        for attachment in request.attachments:
            # Cegah duplikasi jika file ini sudah di-parse dari tags
            if any(attachment.filename in ctx for ctx in attachments_context):
                continue
            file_content = parse_attachment(attachment)
            attachments_context.append(
                f"[Isi Dokumen Terlampir: \"{attachment.filename}\"]\n"
                f"```{attachment.filename.split('.')[-1]}\n"
                f"{file_content}\n"
                f"```"
            )
            
    if attachments_context:
        attachments_str = "\n\n".join(attachments_context) + "\n\n"
        user_message = f"{attachments_str}{user_message}"

    # Sisipkan konteks catatan jika ada di body
    if request.note_title or request.note_content:
        context_str = f"[Konteks Catatan: Judul: \"{request.note_title or ''}\", Konten: \"{request.note_content or ''}\"]\n\n"
        if not user_message.startswith("[Konteks Catatan:"):
            user_message = f"{context_str}Pertanyaan/Instruksi User: {user_message}"
            
    return StreamingResponse(
        chat_event_generator(user_message, request.session_id, request.user_id),
        media_type="text/event-stream",
        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )



from tasks import summarize_task, tags_task

@app.post("/api/summarize")
async def summarize(request: SummarizeRequest, db: AsyncSession = Depends(get_db)):
    # 1. Log sub-agent spawn/task ke database lokal sessions.db dengan status 'pending'
    task = SubAgentTask(
        session_id=request.session_id,
        sub_agent_type="summarizer",
        input_data=request.content[:1000],  # Limit log input
        status="pending"
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    try:
        # 2. Kirim tugas ke Celery worker secara asynchronous
        summarize_task.delay(task.id, request.content, request.user_id)
        
        return {
            "task_id": task.id,
            "status": "pending",
            "message": "Tugas peringkasan telah dikirim ke Celery worker."
        }
    except Exception as e:
        task.status = "failed"
        task.output_data = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gagal mengirim tugas ke Celery: {str(e)}")

@app.post("/api/tags")
async def tags(request: TagsRequest, db: AsyncSession = Depends(get_db)):
    # 1. Log sub-agent spawn/task ke database lokal dengan status 'pending'
    task = SubAgentTask(
        session_id=request.session_id,
        sub_agent_type="tagger",
        input_data=request.content[:1000],
        status="pending"
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    try:
        # 2. Kirim tugas ke Celery worker secara asynchronous
        tags_task.delay(task.id, request.content, request.user_id)
        
        return {
            "task_id": task.id,
            "status": "pending",
            "message": "Tugas ekstraksi tag telah dikirim ke Celery worker."
        }
    except Exception as e:
        task.status = "failed"
        task.output_data = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gagal mengirim tugas ke Celery: {str(e)}")

# Endpoint untuk mengecek status dan hasil task spesifik
@app.get("/api/tasks/status/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    query = select(SubAgentTask).where(SubAgentTask.id == task_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")
    
    return task.to_dict()

# Endpoint opsional untuk memonitor tugas sub-agent yang sedang/pernah berjalan
@app.get("/api/tasks/{session_id}")
async def get_tasks(session_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    query = select(SubAgentTask).where(SubAgentTask.session_id == session_id).order_by(SubAgentTask.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()
    return [task.to_dict() for task in tasks]

@app.post("/api/chat/approve_or_reject")
async def approve_or_reject(request: ApproveRejectRequest):
    if request.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'approved' or 'rejected'.")
        
    try:
        async with engine.begin() as conn:
            query = text("SELECT id, message_data FROM agent_messages WHERE session_id = :session_id")
            result = await conn.execute(query, {"session_id": request.session_id})
            rows = result.fetchall()
            
            found = False
            for row_id, message_data_str in rows:
                try:
                    msg = json.loads(message_data_str)
                    if msg.get("call_id") == request.call_id and msg.get("type") == "function_call_output":
                        output_str = msg.get("output", "{}")
                        output_data = json.loads(output_str)
                        output_data["status"] = request.status
                        msg["output"] = json.dumps(output_data)
                        
                        update_query = text("UPDATE agent_messages SET message_data = :message_data WHERE id = :id")
                        await conn.execute(update_query, {"message_data": json.dumps(msg), "id": row_id})
                        found = True
                        break
                except Exception as ex:
                    logger.error(f"Error parsing message data during approval update: {str(ex)}")
                    continue
            
            if not found:
                raise HTTPException(status_code=404, detail="Tool call output message not found.")
                
        return {"ok": True, "status": request.status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to approve/reject tool call: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update approval status: {str(e)}")

# Endpoint untuk mengambil riwayat chat berdasarkan session_id
@app.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")
    try:
        session = SQLAlchemySession.from_url(
            session_id=session_id,
            url=db_url,
            create_tables=True,
        )
        items = await session.get_items()
        
        # Pass 1: Cari semua output pemanggilan tool (function_call_output)
        tool_outputs = {}
        for item in items:
            item_dict = {}
            if isinstance(item, dict):
                item_dict = item
            elif hasattr(item, "get"):
                item_dict = {k: item.get(k) for k in ["role", "content", "type", "call_id", "output"]}
            else:
                item_dict = {
                    "type": getattr(item, "type", None),
                    "call_id": getattr(item, "call_id", None),
                    "output": getattr(item, "output", None)
                }
            if item_dict.get("type") == "function_call_output":
                call_id = item_dict.get("call_id")
                if call_id:
                    tool_outputs[call_id] = item_dict.get("output")
        
        # Pass 2: Susun riwayat pesan lengkap dengan tipenya
        messages = []
        for item in items:
            role = None
            content = None
            item_type = None
            status = None
            call_id = None
            name = None
            arguments = None

            if isinstance(item, dict):
                role = item.get("role")
                content = item.get("content")
                item_type = item.get("type")
                status = item.get("status")
                call_id = item.get("call_id")
                name = item.get("name")
                arguments = item.get("arguments")
            elif hasattr(item, "get"):
                role = item.get("role")
                content = item.get("content")
                item_type = item.get("type")
                status = item.get("status")
                call_id = item.get("call_id")
                name = item.get("name")
                arguments = item.get("arguments")
            else:
                role = getattr(item, "role", None)
                content = getattr(item, "content", None)
                item_type = getattr(item, "type", None)
                status = getattr(item, "status", None)
                call_id = getattr(item, "call_id", None)
                name = getattr(item, "name", None)
                arguments = getattr(item, "arguments", None)
            
            if item_type == "reasoning":
                messages.append({
                    "role": "assistant",
                    "content": normalize_content(content),
                    "type": "reasoning"
                })
            elif item_type == "function_call":
                # Ambil output untuk tool call ini
                tool_result = tool_outputs.get(call_id)
                # Parse arguments jika berupa string JSON
                args = {}
                if isinstance(arguments, str):
                    try:
                        args = json.loads(arguments)
                    except Exception:
                        args = {"raw_arguments": arguments}
                elif isinstance(arguments, dict):
                    args = arguments
                
                messages.append({
                    "role": "assistant",
                    "type": "tool",
                    "toolCallId": call_id,
                    "toolName": name or "unknown_tool",
                    "args": args,
                    "result": tool_result
                })
            elif role in ["user", "assistant"]:
                msg_type = "completed" if (role == "assistant" and status == "completed") else "text"
                raw_content = normalize_content(content)
                # Hapus prefix konteks catatan dari user message agar tidak tampil di UI
                if role == "user" and raw_content.startswith("[Konteks Catatan:"):
                    marker = "Pertanyaan/Instruksi User: "
                    idx = raw_content.find(marker)
                    if idx != -1:
                        raw_content = raw_content[idx + len(marker):]
                    else:
                        raw_content = re.sub(r'^\[Konteks Catatan:.*?\]\s*\n*', '', raw_content, flags=re.DOTALL)
                messages.append({
                    "role": role,
                    "content": raw_content,
                    "type": msg_type
                })
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

@app.get("/agent")
async def run_agent():
    return {"status": "running", "database_url": os.getenv("DATABASE_URL")}

class DiagramRequest(BaseModel):
    prompt: str
    note_content: str | None = None
    note_title: str | None = None

@app.post("/api/diagram")
async def generate_diagram(request: DiagramRequest):
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash:free")

        system_instruction = (
            "You are an expert flowchart and diagram generator.\n"
            "Your task is to generate a structured JSON object representing a ReactFlow diagram based on the user's prompt.\n"
            "The JSON object MUST follow this exact structure:\n"
            "{\n"
            '  "nodes": [\n'
            '    {\n'
            '      "id": "unique-string-id",\n'
            '      "type": "rectangle" | "circle" | "diamond",\n'
            '      "position": { "x": number, "y": number },\n'
            '      "data": { "label": "Node Label Text" }\n'
            '    }\n'
            '  ],\n'
            '  "edges": [\n'
            '    {\n'
            '      "id": "edge-id-string",\n'
            '      "source": "source-node-id",\n'
            '      "target": "target-node-id"\n'
            '    }\n'
            '  ]\n'
            "}\n\n"
            "Rules for layout and styling:\n"
            "1. Node Types:\n"
            "   - 'circle': Use for start, end, or simple terminators.\n"
            "   - 'rectangle': Use for standard process steps.\n"
            "   - 'diamond': Use for decision points (e.g., 'Is authenticated?', 'Yes/No').\n"
            "2. Coordinates and Spacing:\n"
            "   - Plan the coordinates (x, y) carefully so that there is no overlap and the flow is clear.\n"
            "   - Flow direction: Top-to-Bottom. Standard vertical spacing between levels should be 100-150px (e.g., y=50, y=180, y=310).\n"
            "   - Horizontal spacing: Nodes on the same horizontal level should be spaced 150-200px apart (e.g., x=100, x=300, x=500).\n"
            "   - Align nodes centered around x=300 for a symmetrical vertical flow.\n"
            "3. Return ONLY a valid JSON object. Do not include markdown codeblock wrappers, backticks, or extra text."
        )

        user_message = f"Prompt: {request.prompt}"
        if request.note_title or request.note_content:
            user_message += f"\n\nContext Note Title: {request.note_title or ''}\nContext Note Content:\n{request.note_content or ''}"

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_message}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )

        result_str = response.choices[0].message.content.strip()
        data = json.loads(result_str)
        return data

    except Exception as e:
        logger.error(f"[diagram generation error] {e}")
        raise HTTPException(status_code=500, detail=str(e))