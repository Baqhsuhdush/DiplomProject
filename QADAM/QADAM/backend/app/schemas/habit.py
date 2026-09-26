import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class HabitCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None


class HabitPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str | None
    is_active: bool
    created_at: datetime
    completed_today: bool = False
    current_streak_days: int = 0


class HabitCheckRequest(BaseModel):
    log_date: date | None = None
    completed: bool = True


class HabitCheckPublic(BaseModel):
    habit_id: uuid.UUID
    log_date: date
    completed: bool


class LeaderboardRowPublic(BaseModel):
    rank: int
    user_id: uuid.UUID
    score: int
    tasks_completed: int
    habits_completed: int
    tests_attempted: int
    homework_submissions: int


class LeaderboardPublic(BaseModel):
    period: str
    period_start: date
    period_end: date
    rows: list[LeaderboardRowPublic]
