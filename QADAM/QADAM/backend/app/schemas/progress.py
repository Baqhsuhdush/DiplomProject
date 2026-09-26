import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ProgressLogItemPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    event_type: str
    goal_id: uuid.UUID | None
    task_id: uuid.UUID | None
    payload: dict[str, Any] | None
    created_at: datetime


class ProgressOverviewPublic(BaseModel):
    """Снимок прогресса по задачам и целям (без внешних сервисов)."""

    generated_at: datetime
    goals_total: int
    goals_active: int
    tasks_total: int
    tasks_by_status: dict[str, int] = Field(default_factory=dict)
    overdue_open_tasks: int
    task_completion_streak_days: int = 0
    tests_attempts_last_7_days: int
    homework_submissions_last_7_days: int
    tasks_completed_last_7_days: int


class DayActivityPublic(BaseModel):
    date: date
    test_attempts: int
    homework_submissions: int
    tasks_completed: int = 0


class WeeklyReportPublic(BaseModel):
    period_start: date
    period_end: date
    days: list[DayActivityPublic]
    totals: dict[str, Any]


class MonthlyReportPublic(BaseModel):
    period_start: date
    period_end: date
    days: list[DayActivityPublic]
    totals: dict[str, Any]


class ProgressRecommendationsPublic(BaseModel):
    generated_at: datetime
    next_milestone: int
    streak_to_go: int
    tips: list[str] = Field(default_factory=list)


class ProgressChartsPublic(BaseModel):
    generated_at: datetime
    period_start: date
    period_end: date
    completion_series: list[dict[str, int | str]]
    habits_series: list[dict[str, int | str]]


class PredictiveInsightPublic(BaseModel):
    generated_at: datetime
    completion_velocity_per_day: float
    overdue_risk_score: int
    streak_trend: str
    next_7_days_focus: list[str] = Field(default_factory=list)
    explanation: str
