import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

TASK_STATUSES = frozenset({"pending", "in_progress", "completed", "cancelled"})


class TaskListItem(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    goal_id: uuid.UUID
    roadmap_step_id: uuid.UUID
    title: str
    task_type: str
    due_at: datetime | None
    status: str
    completed_at: datetime | None = None
    last_nudge_at: datetime | None = None
    created_at: datetime


class TaskStatusPatch(BaseModel):
    status: str = Field(..., max_length=32)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        key = v.strip().lower()
        if key not in TASK_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(TASK_STATUSES))}")
        return key


class TaskDuePatch(BaseModel):
    """Reschedule: set due date (UTC instant) or clear."""

    due_at: datetime | None = None


class TaskRescheduleBody(BaseModel):
    """POST …/reschedule — новый дедлайн обязателен (очистка через PATCH …/due)."""

    due_at: datetime
