import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AssessmentCreate(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class AssessmentPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    goal_id: uuid.UUID
    answers: dict[str, Any]
    ai_summary: str | None
    created_at: datetime
