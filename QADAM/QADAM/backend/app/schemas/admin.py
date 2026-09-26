import uuid
from datetime import datetime
from typing import Any

from typing import Self

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class AdminUserRow(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    is_superuser: bool
    created_at: datetime


class AdminUserPatch(BaseModel):
    """Частичное обновление учётки (хотя бы одно поле)."""

    is_active: bool | None = None
    is_superuser: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> Self:
        if self.is_active is None and self.is_superuser is None:
            raise ValueError("Provide is_active and/or is_superuser")
        return self


class AdminUserProgressPublic(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    goals_total: int
    goals_active: int
    tasks_total: int
    tasks_by_status: dict[str, int] = Field(default_factory=dict)
    active_roadmaps: int
    tests_attempts_last_7_days: int
    homework_submissions_last_7_days: int
    tasks_completed_last_7_days: int


class RoadmapAdminPatch(BaseModel):
    status: str = Field(..., max_length=32)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        key = v.strip().lower()
        if key not in ("active", "archived"):
            raise ValueError("status must be active or archived")
        return key


class RoadmapStatusPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str


class AdminRoadmapRow(BaseModel):
    """Roadmap с контекстом цели и пользователя (админ-список)."""

    id: uuid.UUID
    goal_id: uuid.UUID
    user_id: uuid.UUID
    user_email: EmailStr
    goal_title: str
    version: int
    status: str
    created_at: datetime


class AdminAuditLogPublic(BaseModel):
    """Запись журнала аудита (чтение суперпользователем)."""

    id: uuid.UUID
    actor_user_id: uuid.UUID
    actor_email: EmailStr
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    payload: dict[str, Any] | None = None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
