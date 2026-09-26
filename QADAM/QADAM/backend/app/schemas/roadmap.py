import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TaskPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    roadmap_step_id: uuid.UUID
    title: str
    task_type: str
    due_at: datetime | None
    status: str
    completed_at: datetime | None = None
    last_nudge_at: datetime | None = None
    created_at: datetime


class RoadmapStepPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    sequence_no: int
    title: str
    description: str | None
    estimated_days: int | None
    tasks: list[TaskPublic] = Field(default_factory=list)


class RoadmapPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    goal_id: uuid.UUID
    user_id: uuid.UUID
    version: int
    status: str
    created_at: datetime
    steps: list[RoadmapStepPublic] = Field(default_factory=list)
