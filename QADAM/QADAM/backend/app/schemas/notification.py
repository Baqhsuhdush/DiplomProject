import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NotificationPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID | None = None
    channel: str
    status: str
    error_detail: str | None = None
    payload: dict[str, Any] | None = Field(default=None)
    sent_at: datetime
