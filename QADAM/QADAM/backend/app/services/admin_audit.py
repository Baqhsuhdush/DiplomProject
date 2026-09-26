from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.admin_audit_log import AdminAuditLog
from app.models.user import User


def append_admin_audit(
    db: Session,
    *,
    actor: User,
    action: str,
    target_type: str | None = None,
    target_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    ip: str | None = None
    ua: str | None = None
    if request is not None:
        if request.client and request.client.host:
            ip = request.client.host[:45]
        raw_ua = request.headers.get("user-agent")
        if raw_ua:
            ua = raw_ua[:512]
    db.add(
        AdminAuditLog(
            actor_user_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            ip_address=ip,
            user_agent=ua,
        )
    )
