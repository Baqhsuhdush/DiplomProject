import secrets
from uuid import UUID

from app.core.redis_client import get_redis

PREFIX = "qadam:tglink:"


def _payload() -> str:
    return secrets.token_hex(16)


def create_link_token(*, user_id: UUID, ttl_seconds: int) -> str:
    r = get_redis()
    if r is None:
        raise RuntimeError("REDIS_URL is not configured")
    token = _payload()
    key = f"{PREFIX}{token}"
    r.setex(key, max(60, ttl_seconds), str(user_id))
    return token


def peek_link_token(token: str) -> UUID | None:
    r = get_redis()
    if r is None:
        return None
    key = f"{PREFIX}{token.strip()}"
    raw = r.get(key)
    if raw is None:
        return None
    try:
        return UUID(str(raw))
    except ValueError:
        return None


def delete_link_token(token: str) -> None:
    r = get_redis()
    if r is None:
        return
    key = f"{PREFIX}{token.strip()}"
    r.delete(key)
