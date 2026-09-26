import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

GOAL_DOMAINS = frozenset(
    {
        "learning",
        "programming",
        "sport",
        "english",
        "career",
        "business",
        "self_development",
        "other",
    }
)
GOAL_STATUSES = frozenset({"active", "paused", "completed", "archived"})


class GoalCreate(BaseModel):
    domain: str = Field(..., max_length=64)
    title: str = Field(..., min_length=1, max_length=500)
    target_date: date | None = None
    priority: int = Field(default=3, ge=1, le=5)

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        key = v.strip().lower()
        if key not in GOAL_DOMAINS:
            raise ValueError(f"domain must be one of: {', '.join(sorted(GOAL_DOMAINS))}")
        return key


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    target_date: date | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    status: str | None = Field(default=None, max_length=32)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        key = v.strip().lower()
        if key not in GOAL_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(GOAL_STATUSES))}")
        return key


class GoalPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    domain: str
    title: str
    target_date: date | None
    priority: int
    status: str
    created_at: datetime
