from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def _encode_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    settings = get_settings()
    to_encode = data.copy()
    now = datetime.now(UTC)
    to_encode["exp"] = now + expires_delta
    to_encode["iat"] = now
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()
    return _encode_token(
        {"sub": str(user_id), "typ": "access"},
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(user_id: UUID) -> str:
    settings = get_settings()
    return _encode_token(
        {"sub": str(user_id), "typ": "refresh"},
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def get_user_id_from_token(token: str, expected_typ: str) -> UUID:
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise ValueError("invalid token") from exc
    if payload.get("typ") != expected_typ:
        raise ValueError("wrong token type")
    sub = payload.get("sub")
    if not sub:
        raise ValueError("missing subject")
    return UUID(str(sub))
