import json
import logging
import re
import base64

import httpx
from agents import Runner

from core.settings import settings

logger = logging.getLogger("ai-agent")


def _parse_scores(text: str) -> dict | None:
    """Extract JSON scores from judge output, with regex fallback."""
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


def _clamp(val, lo=0, hi=10) -> float:
    try:
        return max(lo, min(hi, float(val)))
    except (TypeError, ValueError):
        return 5.0


async def _post_score(client: httpx.AsyncClient, auth: str, trace_id: str, name: str, value: float, comment: str = ""):
    body = {"traceId": trace_id, "name": name, "value": value, "dataType": "NUMERIC"}
    if comment:
        body["comment"] = comment
    try:
        resp = await client.post(
            f"{settings.langfuse_host}/api/public/scores",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            json=body,
            timeout=10,
        )
        if not resp.is_success:
            logger.warning(f"[judge] Langfuse score POST failed: {resp.status_code}")
    except Exception as e:
        logger.warning(f"[judge] Langfuse score POST error: {e}")


def _format_context(tool_results: list[dict]) -> str:
    """Serialize collected tool results into a readable context block for the judge."""
    if not tool_results:
        return "No tool results — the assistant answered without retrieving external data."
    parts = []
    for i, item in enumerate(tool_results, 1):
        tool = item.get("tool", "unknown")
        output = item.get("output", "")
        if isinstance(output, dict):
            output = json.dumps(output, ensure_ascii=False)
        elif not isinstance(output, str):
            output = str(output)
        parts.append(f"[{i}] Tool: {tool}\n{output[:1000]}")
    return "\n\n".join(parts)


async def run_judge(
    question: str,
    answer: str,
    trace_id: str | None,
    tool_results: list[dict] | None = None,
) -> None:
    """Run LLM-as-judge in background and post scores to Langfuse.

    tool_results: list of {tool: str, output: any} collected during the turn.
    Judge reads this context before scoring — if context is empty and the
    answer makes factual claims, it flags context_missing and skips scoring.
    """
    if not answer.strip():
        return

    try:
        from modules.chat.agent_defs import judge_agent
        from core.prompt import JUDGE_PROMPT

        context_str = _format_context(tool_results or [])
        prompt = JUDGE_PROMPT.format(question=question, answer=answer, context=context_str)
        result = await Runner.run(judge_agent, prompt, max_turns=1)
        raw = result.final_output or ""

        scores = _parse_scores(raw)
        if not scores:
            logger.warning(f"[judge] Could not parse scores from: {raw[:200]}")
            return

        context_missing = bool(scores.get("context_missing", False))
        reasoning = str(scores.get("reasoning", ""))

        if context_missing:
            logger.info(f"[judge] Skipping scores — context_missing flagged. Reason: {reasoning}")
            return

        relevance = _clamp(scores.get("relevance", 5))
        groundedness = _clamp(scores.get("groundedness", 5))
        conciseness = _clamp(scores.get("conciseness", 5))
        context_coverage = _clamp(scores.get("context_coverage", 5))

        logger.info(
            f"[judge] scores: relevance={relevance} groundedness={groundedness} "
            f"conciseness={conciseness} context_coverage={context_coverage}"
        )

        if not trace_id or not settings.langfuse_public_key or not settings.langfuse_secret_key:
            return

        auth = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            await _post_score(client, auth, trace_id, "relevance", relevance, reasoning)
            await _post_score(client, auth, trace_id, "groundedness", groundedness)
            await _post_score(client, auth, trace_id, "conciseness", conciseness)
            await _post_score(client, auth, trace_id, "context_coverage", context_coverage)

    except Exception as e:
        logger.warning(f"[judge] Failed: {e}")
