import uuid
from datetime import datetime

from pydantic import BaseModel


class HomeworkViewPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID
    text_answer: str | None
    original_filename: str | None
    ai_feedback: str | None
    grade: int | None
    created_at: datetime
    download_path: str | None = None
