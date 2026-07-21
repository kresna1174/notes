import os
import logging

import redis.asyncio as aioredis
from fastapi import HTTPException

logger = logging.getLogger("ai-agent")

_redis_pool: aioredis.ConnectionPool | None = None


def _get_pool() -> aioredis.ConnectionPool:
    global _redis_pool
    if _redis_pool is None:
        url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
        _redis_pool = aioredis.ConnectionPool.from_url(url, decode_responses=True)
    return _redis_pool


async def check_rate_limit(
    identifier: str,
    action: str = "chat",
    limit: int = 20,
    window: int = 60,
) -> None:
    """Increment counter for identifier. Raise HTTP 429 if limit exceeded.

    Uses a simple fixed-window counter in Redis.
    identifier: user_id or session_id
    limit: max requests per window
    window: window size in seconds
    """
    client = aioredis.Redis(connection_pool=_get_pool())
    key = f"rl:{action}:{identifier}"
    try:
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, window)
        if current > limit:
            ttl = await client.ttl(key)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({limit} req/{window}s). Retry in {max(ttl, 1)}s.",
                headers={"Retry-After": str(max(ttl, 1))},
            )
        logger.debug(f"[rate_limit] {key} = {current}/{limit}")
    except HTTPException:
        raise
    except Exception as e:
        # Redis down — fail open (don't block users if Redis is unavailable)
        logger.warning(f"[rate_limit] Redis error, skipping limit: {e}")
    finally:
        await client.aclose()
