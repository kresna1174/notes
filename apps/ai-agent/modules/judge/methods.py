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


async def run_judge(question: str, answer: str, trace_id: str | None) -> None:
    """Run LLM-as-judge in background and post scores to Langfuse."""
    if not answer.strip():
        return

    try:
        from modules.chat.agent_defs import judge_agent
        from core.prompt import JUDGE_PROMPT

        prompt = JUDGE_PROMPT.format(question=question, answer=answer)
        result = await Runner.run(judge_agent, prompt, max_turns=1)
        raw = result.final_output or ""

        scores = _parse_scores(raw)
        if not scores:
            logger.warning(f"[judge] Could not parse scores from: {raw[:200]}")
            return

        relevance = _clamp(scores.get("relevance", 5))
        groundedness = _clamp(scores.get("groundedness", 5))
        conciseness = _clamp(scores.get("conciseness", 5))
        reasoning = str(scores.get("reasoning", ""))

        logger.info(f"[judge] scores: relevance={relevance} groundedness={groundedness} conciseness={conciseness}")

        if not trace_id or not settings.langfuse_public_key or not settings.langfuse_secret_key:
            return

        auth = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            await _post_score(client, auth, trace_id, "relevance", relevance, reasoning)
            await _post_score(client, auth, trace_id, "groundedness", groundedness)
            await _post_score(client, auth, trace_id, "conciseness", conciseness)

    except Exception as e:
        logger.warning(f"[judge] Failed: {e}")
