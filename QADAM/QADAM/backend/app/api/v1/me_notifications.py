from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationPublic

router = APIRouter()


@router.get("/notifications", response_model=list[NotificationPublic])
def list_my_notifications(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    limit: int = Query(default=40, ge=1, le=200),
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == current.id)
        .order_by(Notification.sent_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
