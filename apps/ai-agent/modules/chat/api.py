import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai.types.responses import (
    ResponseReasoningTextDeltaEvent,
    ResponseTextDeltaEvent,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from agents import Runner, ToolCallItem, ToolCallOutputItem
from agents.extensions.memory import SQLAlchemySession

from core.database import engine, get_db
from core.models import SubAgentTask, SessionTokenUsage

from modules.chat.schemas import (
    ChatRequest, ChatStreamRequest, ChatAttachment, SummarizeRequest,
    TagsRequest, ApproveRejectRequest, DiagramRequest,
)
from modules.chat.agent_defs import parent_agent, resolve_agent, get_agent, AGENT_REGISTRY, DIRECT_SELECT_AGENTS
from modules.chat.helpers import normalize_content, sse, vercel_data, safe_jsonable, parse_attachment
from modules.chat.guard import check_input_guardrail
from modules.rag.methods import chunk_text, BM25Retriever, ChromaVectorStore

logger = logging.getLogger("ai-agent")
vector_store = ChromaVectorStore()

router = APIRouter()


def _register_routes(app):
    """Mount all routes from this module onto the given FastAPI app."""
    app.include_router(router)


# ── Non-streaming chat ───────────────────────────────────────────────────────

@router.post("/api/chat")
async def chat(request: ChatRequest):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")
    try:
        session = SQLAlchemySession.from_url(
            session_id=request.session_id,
            url=db_url,
            create_tables=True,
        )

        agent = resolve_agent(request.agent, request.message)
        context = {"session_id": request.session_id, "user_id": request.user_id}
        result = await Runner.run(agent, request.message, session=session, context=context, max_turns=50)

        return {
            "response": normalize_content(result.final_output),
            "session_id": request.session_id,
            "agent": agent.name,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process chat: {str(e)}")


# ── Streaming chat ───────────────────────────────────────────────────────────

async def chat_event_generator(message: str, session_id: str, user_id: str | None = None, agent_key: str | None = None):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")

    # Resolve which agent to use
    agent = resolve_agent(agent_key, message)
    logger.info(f"Using agent: {agent.name} (key={agent_key})")

    # The root agent is the one directly invoked — its text always goes to text-delta.
    # Only sub-agents delegated by the root get routed to reasoning-delta.
    root_agent_name = agent.name
    active_agent = agent.name
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
            agent,
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

                    if active_agent != root_agent_name:
                        # Switched to a sub-agent — show reasoning indicator
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
                        # Returned to root agent — close reasoning if open
                        if current_reasoning_id:
                            yield sse({"type": "reasoning-end", "id": current_reasoning_id})
                            current_reasoning_id = None

            elif event.type == "raw_response_event":
                data = event.data
                logger.info(f"  -> Raw response event: data_class={data.__class__.__name__}")

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

                        try:
                            model_name = getattr(resp, "model", None) or os.getenv("OPENROUTER_MODEL", "unknown")
                            async with engine.begin() as conn:
                                await conn.run_sync(lambda sync_conn: sync_conn.execute(
                                    SessionTokenUsage.__table__.insert().values(
                                        id=str(uuid.uuid4()),
                                        session_id=session_id,
                                        prompt_tokens=input_toks,
                                        completion_tokens=output_toks,
                                        model=model_name,
                                        created_at=datetime.now(timezone.utc),
                                    )
                                ))
                        except Exception as token_err:
                            logger.error(f"Failed to save token usage: {token_err}")

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
                    if active_agent != root_agent_name:
                        # Text from a delegated sub-agent → show as reasoning/thinking
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
                        # Text from the root agent → emit as text-delta for the frontend
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


@router.post("/api/chat/stream")
async def chat_stream(request: ChatStreamRequest):
    user_message = ""
    if request.message:
        user_message = request.message
    elif request.messages:
        last_msg = request.messages[-1]
        content = last_msg.get("content", "")

        if isinstance(content, str) and content.strip():
            user_message = content.strip()
        elif isinstance(content, list):
            parts_text = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts_text.append(part.get("text", ""))
            user_message = "".join(parts_text)

        if not user_message:
            parts = last_msg.get("parts", [])
            parts_text = []
            for part in parts:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts_text.append(part.get("text", ""))
            user_message = "".join(parts_text)

        logger.info(f"Extracted user_message: {user_message[:100]!r}")

    # Input Guardrail check
    _clean_for_check = re.sub(
        r'\[Isi Dokumen Terlampir:[^\]]+\]', '', user_message
    ).strip()
    _deflection = check_input_guardrail(_clean_for_check)
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

    # Extract the user query before prepending documents to use for RAG semantic search
    user_query = user_message
    pattern = r'\[Isi Dokumen Terlampir:\s*"([^"]+)"\s+filePath="([^"]+)"\s+mimeType="([^"]+)"\]'
    tag_matches = re.findall(pattern, user_query)
    if tag_matches:
        user_query = re.sub(pattern, '', user_query).strip()

    attachments_context = []

    async def process_attachment_rag(att: ChatAttachment, query: str) -> str:
        content = parse_attachment(att)
        # For small documents, inject the entire text for maximum context accuracy
        if len(content) <= 4000:
            return (
                f"[Isi Dokumen Terlampir: \"{att.filename}\"]\n"
                f"```{att.filename.split('.')[-1]}\n"
                f"{content}\n"
                f"```"
            )
        
        search_query = query if query.strip() else "summary ringkasan"

        # 1. Attempt Dense Vector Search via ChromaVectorStore (OpenRouter Embeddings)
        logger.info(f"Attempting Dense Vector RAG for: {att.filename}")
        try:
            vector_results = await vector_store.search(
                filename=att.filename,
                file_path=att.filePath,
                session_id=request.session_id,
                content=content,
                query=search_query,
                top_k=4
            )
        except Exception as e:
            logger.error(f"Dense Vector RAG search failed with error: {e}")
            vector_results = None

        # 2. If Dense Vector search succeeded, return it
        if vector_results is not None:
            logger.info(f"Dense Vector RAG succeeded for {att.filename}")
            rag_parts = []
            for idx, (chunk, score) in enumerate(vector_results, 1):
                rag_parts.append(f"--- Bagian Relevan {idx} (Cosine Similarity: {score:.4f}) ---\n{chunk}")
            rag_content = "\n\n".join(rag_parts)
            return (
                f"[Potongan Dokumen Terlampir (RAG Vektor Semantik): \"{att.filename}\"]\n"
                f"Dokumen ini berukuran besar (> 4000 karakter). "
                f"Berikut adalah bagian paragraf yang paling relevan dengan pertanyaan/instruksi Anda (diambil secara semantik):\n"
                f"```\n"
                f"{rag_content}\n"
                f"```"
            )

        # 3. Fallback to BM25 Sparse Search if Embeddings fail
        logger.warning(f"Dense Vector RAG failed/fallback to Sparse BM25 RAG for: {att.filename}")
        chunks = chunk_text(content, chunk_size=800, overlap=150)
        if not chunks:
            return f"[Isi Dokumen Terlampir: \"{att.filename}\" (Dokumen Kosong atau Gagal Diproses)]"
            
        retriever = BM25Retriever(chunks)
        results = retriever.retrieve(search_query, top_k=4)
        
        rag_parts = []
        for idx, (chunk, score) in enumerate(results, 1):
            rag_parts.append(f"--- Bagian Relevan {idx} (Relevance Score BM25: {score:.2f}) ---\n{chunk}")
            
        rag_content = "\n\n".join(rag_parts)
        return (
            f"[Potongan Dokumen Terlampir (RAG BM25 Fallback): \"{att.filename}\"]\n"
            f"Dokumen ini berukuran besar (> 4000 karakter). "
            f"Berikut adalah bagian paragraf yang paling relevan dengan pertanyaan/instruksi Anda (diambil secara kata kunci):\n"
            f"```\n"
            f"{rag_content}\n"
            f"```"
        )

    for filename, filePath, mimeType in tag_matches:
        attachment = ChatAttachment(filename=filename, filePath=filePath, mimeType=mimeType)
        attachments_context.append(await process_attachment_rag(attachment, user_query))

    if tag_matches:
        user_message = re.sub(pattern, '', user_message).strip()

    if request.attachments:
        for attachment in request.attachments:
            if any(attachment.filename in ctx for ctx in attachments_context):
                continue
            attachments_context.append(await process_attachment_rag(attachment, user_query))

    if attachments_context:
        attachments_str = "\n\n".join(attachments_context) + "\n\n"
        user_message = f"{attachments_str}{user_message}"

    if request.note_title or request.note_content:
        context_str = f"[Konteks Catatan: Judul: \"{request.note_title or ''}\", Konten: \"{request.note_content or ''}\"]\n\n"
        if not user_message.startswith("[Konteks Catatan:"):
            user_message = f"{context_str}Pertanyaan/Instruksi User: {user_message}"

    return StreamingResponse(
        chat_event_generator(user_message, request.session_id, request.user_id, agent_key=request.agent),
        media_type="text/event-stream",
        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ── Celery tasks (summarize / tags) ─────────────────────────────────────────

from tasks import summarize_task, tags_task


@router.post("/api/summarize")
async def summarize(request: SummarizeRequest, db: AsyncSession = Depends(get_db)):
    task = SubAgentTask(
        session_id=request.session_id,
        sub_agent_type="summarizer",
        input_data=request.content[:1000],
        status="pending"
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    try:
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


@router.post("/api/tags")
async def tags(request: TagsRequest, db: AsyncSession = Depends(get_db)):
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


# ── Task status ──────────────────────────────────────────────────────────────

@router.get("/api/tasks/status/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    query = select(SubAgentTask).where(SubAgentTask.id == task_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task tidak ditemukan")

    return task.to_dict()


@router.get("/api/tasks/{session_id}")
async def get_tasks(session_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    query = select(SubAgentTask).where(SubAgentTask.session_id == session_id).order_by(SubAgentTask.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()
    return [task.to_dict() for task in tasks]


# ── Approve / Reject tool calls ──────────────────────────────────────────────

@router.post("/api/chat/approve_or_reject")
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


# ── Chat history ─────────────────────────────────────────────────────────────

@router.get("/api/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///sessions.db")
    try:
        session = SQLAlchemySession.from_url(
            session_id=session_id,
            url=db_url,
            create_tables=True,
        )
        items = await session.get_items()

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
                tool_result = tool_outputs.get(call_id)
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


# ── Admin: sessions monitoring ───────────────────────────────────────────────

@router.get("/api/admin/sessions")
async def admin_list_sessions(user_id: str | None = None, page: int = 1, page_size: int = 30):
    try:
        async with engine.connect() as conn:
            total_row = await conn.execute(text("SELECT COUNT(*) FROM agent_sessions"))
            total = total_row.scalar() or 0

            offset = (page - 1) * page_size
            sessions_rows = await conn.execute(text("""
                SELECT
                    s.session_id,
                    s.created_at,
                    s.updated_at,
                    (SELECT COUNT(*) FROM agent_messages WHERE session_id = s.session_id) as message_count,
                    (SELECT COUNT(*) FROM agent_messages WHERE session_id = s.session_id AND message_data ILIKE '%"role":"user"%') as user_message_count,
                    (SELECT COUNT(*) FROM agent_messages WHERE session_id = s.session_id AND message_data ILIKE '%"type":"function_call"%') as tool_call_count
                FROM agent_sessions s
                ORDER BY s.updated_at DESC
                LIMIT :limit OFFSET :offset
            """), {"limit": page_size, "offset": offset})
            sessions = sessions_rows.mappings().all()

            token_rows = await conn.execute(text("""
                SELECT session_id, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens
                FROM session_token_usage
                GROUP BY session_id
            """))
            token_map = {r["session_id"]: {"prompt_tokens": r["prompt_tokens"], "completion_tokens": r["completion_tokens"]} for r in token_rows.mappings()}

            result = []
            for sess in sessions:
                sid = sess["session_id"]

                first_user_msg_row = await conn.execute(text("""
                    SELECT message_data FROM agent_messages
                    WHERE session_id = :sid AND message_data ILIKE '%"role":"user"%'
                    ORDER BY created_at ASC LIMIT 1
                """), {"sid": sid})
                first_user_msg = first_user_msg_row.first()

                extracted_user_id = None
                note_title = None
                prompt_preview = ""
                if first_user_msg:
                    try:
                        msg = json.loads(first_user_msg[0])
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
                        prompt_preview = (content or "")[:300]
                        ctx = msg.get("context", {})
                        if isinstance(ctx, dict):
                            extracted_user_id = ctx.get("user_id")
                            note_title = ctx.get("note_title")
                        if not note_title:
                            m = re.search(r'Konteks Catatan.*?Judul:\s*"([^"]+)"', prompt_preview)
                            if m:
                                note_title = m.group(1)
                    except Exception:
                        pass

                has_error = False
                error_msg = None
                error_row_result = await conn.execute(text("""
                    SELECT message_data FROM agent_messages
                    WHERE session_id = :sid AND (message_data ILIKE '%"error"%' OR message_data ILIKE '%failed%')
                    ORDER BY created_at DESC LIMIT 1
                """), {"sid": sid})
                error_row = error_row_result.first()
                if error_row:
                    try:
                        err_data = json.loads(error_row[0])
                        if err_data.get("type") == "error" or err_data.get("status") == "failed":
                            has_error = True
                            error_msg = (err_data.get("error") or err_data.get("output", ""))[:300]
                    except Exception:
                        pass

                recent_msgs_result = await conn.execute(text("""
                    SELECT message_data FROM agent_messages
                    WHERE session_id = :sid
                    ORDER BY created_at DESC LIMIT 10
                """), {"sid": sid})
                recent_msgs = recent_msgs_result.fetchall()
                formatted_messages = []
                for row in reversed(recent_msgs):
                    try:
                        parsed = json.loads(row[0])
                        role = parsed.get("role", "unknown")
                        msg_type = parsed.get("type", "message")
                        content = parsed.get("content", "")
                        if isinstance(content, list):
                            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
                        formatted_messages.append({
                            "role": role,
                            "type": msg_type,
                            "content": (content or "")[:500],
                            "name": parsed.get("name"),
                            "tool_call_id": parsed.get("call_id"),
                        })
                    except Exception:
                        pass

                tokens = token_map.get(sid, {"prompt_tokens": 0, "completion_tokens": 0})

                result.append({
                    "session_id": sid,
                    "user_id": extracted_user_id,
                    "note_title": note_title,
                    "created_at": sess["created_at"],
                    "updated_at": sess["updated_at"],
                    "message_count": sess["message_count"],
                    "user_message_count": sess["user_message_count"],
                    "tool_call_count": sess["tool_call_count"],
                    "prompt_preview": prompt_preview,
                    "has_error": has_error,
                    "error_message": error_msg,
                    "prompt_tokens": tokens["prompt_tokens"],
                    "completion_tokens": tokens["completion_tokens"],
                    "messages": formatted_messages,
                })

            if user_id:
                result = [s for s in result if s.get("user_id") == user_id]

            stats_row = await conn.execute(text("""
                SELECT
                    COUNT(*) as total_sessions,
                    (SELECT COUNT(*) FROM agent_messages) as total_messages,
                    (SELECT COUNT(*) FROM agent_messages WHERE message_data ILIKE '%"role":"user"%') as total_user_messages,
                    (SELECT COUNT(*) FROM agent_messages WHERE message_data ILIKE '%"type":"function_call"%') as total_tool_calls
                FROM agent_sessions
            """))
            stats = stats_row.mappings().first() or {}

            token_stats_row = await conn.execute(text("""
                SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt, COALESCE(SUM(completion_tokens), 0) as total_completion
                FROM session_token_usage
            """))
            token_stats = token_stats_row.first()

        return {
            "sessions": result,
            "total": total,
            "page": page,
            "page_size": page_size,
            "stats": {
                "total_sessions": stats.get("total_sessions", 0),
                "total_messages": stats.get("total_messages", 0),
                "total_user_messages": stats.get("total_user_messages", 0),
                "total_tool_calls": stats.get("total_tool_calls", 0),
                "total_prompt_tokens": token_stats[0] if token_stats else 0,
                "total_completion_tokens": token_stats[1] if token_stats else 0,
            }
        }
    except Exception as e:
        logger.error(f"Failed to list sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list sessions: {str(e)}")


# ── Health check ─────────────────────────────────────────────────────────────

@router.get("/agent")
async def run_agent():
    return {"status": "running", "database_url": os.getenv("DATABASE_URL")}


# ── List available agents ────────────────────────────────────────────────────

@router.get("/api/agents")
async def list_agents():
    """Return all available agents and their capabilities."""
    agents = []
    for key, agent in AGENT_REGISTRY.items():
        agents.append({
            "key": key,
            "name": agent.name,
            "selectable": key in DIRECT_SELECT_AGENTS,
            "description": _AGENT_DESCRIPTIONS.get(key, ""),
        })
    return {"agents": agents, "default": "main"}


_AGENT_DESCRIPTIONS = {
    "main": "General-purpose assistant. Delegates to specialized sub-agents automatically.",
    "summarizer": "Summarizes note content into concise bullet points.",
    "tagger": "Extracts 3-5 relevant tags from note content.",
    "writer": "Drafts, expands, and restructures written content.",
    "researcher": "Researches topics via web search and compiles findings.",
    "translator": "Translates text between languages while preserving formatting.",
    "code_analyst": "Writes and executes Python code for data analysis and chart generation.",
    "editor": "Proofreads, refines, and improves existing text.",
}


# ── Diagram generation ───────────────────────────────────────────────────────

@router.post("/api/diagram")
async def generate_diagram(request: DiagramRequest):
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
        if model.startswith("openrouter/"):
            model = model.replace("openrouter/", "", 1)
        if "gemini-3.5" in model:
            model = model.replace("gemini-3.5", "gemini-2.5")

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
