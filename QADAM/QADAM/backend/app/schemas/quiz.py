import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


def strip_correct_answers(questions_blob: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "passing_score": int(questions_blob.get("passing_score", 60)),
        "questions": [],
    }
    for q in questions_blob.get("questions", []):
        if not isinstance(q, dict):
            continue
        public = {k: v for k, v in q.items() if k not in ("correct_index", "correct_answer", "rubric")}
        out["questions"].append(public)
    return out


class TestViewPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID
    test_type: str
    created_at: datetime
    content: dict[str, Any]


class AttemptCreate(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class AttemptResultPublic(BaseModel):
    id: uuid.UUID
    test_id: uuid.UUID
    score: int
    passed: bool
    passing_score: int
    created_at: datetime
    details: list[dict[str, Any]] = Field(default_factory=list)
