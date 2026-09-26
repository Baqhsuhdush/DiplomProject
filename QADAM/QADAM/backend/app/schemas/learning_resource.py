import uuid
from datetime import datetime

from pydantic import BaseModel


class LearningResourcePublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID
    source: str
    url: str
    title: str
    language: str | None
    duration_min: int | None
    created_at: datetime
