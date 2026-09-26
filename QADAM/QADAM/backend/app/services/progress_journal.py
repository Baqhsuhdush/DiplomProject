from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.progress_log import ProgressLog


def append_progress_log(
    db: Session,
    *,
    user_id: UUID,
    event_type: str,
    goal_id: UUID | None = None,
    task_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    db.add(
        ProgressLog(
            user_id=user_id,
            event_type=event_type,
            goal_id=goal_id,
            task_id=task_id,
            payload=payload,
        )
    )
