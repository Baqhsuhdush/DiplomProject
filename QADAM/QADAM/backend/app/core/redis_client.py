import json
import logging
from typing import Any

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    global _redis
    url = get_settings().redis_url
    if not url:
        return None
    if _redis is None:
        _redis = redis.Redis.from_url(url, decode_responses=True)
    return _redis


def audit_reminder(event: dict[str, Any]) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        line = json.dumps(event, default=str, ensure_ascii=False)
        r.lpush("qadam:reminder_audit", line)
        r.ltrim("qadam:reminder_audit", 0, 999)
    except Exception:
        logger.exception("redis audit write failed")
