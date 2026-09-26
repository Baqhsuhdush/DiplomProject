from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.homework import HomeworkSubmission
from app.models.quiz import Test, TestAttempt
from app.models.roadmap import Task as TaskModel


def utc_day_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=UTC)


def utc_day_end_exclusive(d: date) -> datetime:
    return datetime.combine(d + timedelta(days=1), time.min, tzinfo=UTC)


def _daterange_inclusive(start: date, end: date) -> list[date]:
    out: list[date] = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur += timedelta(days=1)
    return out


def tasks_by_status(db: Session, user_id: UUID) -> dict[str, int]:
    rows = db.execute(
        select(TaskModel.status, func.count())
        .where(TaskModel.user_id == user_id)
        .group_by(TaskModel.status)
    ).all()
    return {str(status): int(n) for status, n in rows}


def overdue_open_tasks_count(db: Session, user_id: UUID, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    return int(
        db.scalar(
            select(func.count())
            .select_from(TaskModel)
            .where(
                TaskModel.user_id == user_id,
                TaskModel.status.in_(("pending", "in_progress")),
                TaskModel.due_at.is_not(None),
                TaskModel.due_at < now,
            )
        )
        or 0
    )


def test_attempts_in_range(db: Session, user_id: UUID, start: datetime, end: datetime) -> list[datetime]:
    stmt = (
        select(TestAttempt.created_at)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(TaskModel, TaskModel.id == Test.task_id)
        .where(
            TaskModel.user_id == user_id,
            TestAttempt.created_at >= start,
            TestAttempt.created_at < end,
        )
    )
    return list(db.scalars(stmt).all())


def task_completions_in_range(db: Session, user_id: UUID, start: datetime, end: datetime) -> list[datetime]:
    stmt = select(TaskModel.completed_at).where(
        TaskModel.user_id == user_id,
        TaskModel.status == "completed",
        TaskModel.completed_at.is_not(None),
        TaskModel.completed_at >= start,
        TaskModel.completed_at < end,
    )
    return list(db.scalars(stmt).all())


def homework_timestamps_in_range(db: Session, user_id: UUID, start: datetime, end: datetime) -> list[datetime]:
    stmt = select(HomeworkSubmission.created_at).where(
        HomeworkSubmission.user_id == user_id,
        HomeworkSubmission.created_at >= start,
        HomeworkSubmission.created_at < end,
    )
    return list(db.scalars(stmt).all())


def bucket_by_utc_date(timestamps: list[datetime | None]) -> dict[date, int]:
    out: dict[date, int] = defaultdict(int)
    for ts in timestamps:
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        d = ts.astimezone(UTC).date()
        out[d] += 1
    return dict(out)


def completion_streak_from_active_days(active_days: set[date], today: date) -> int:
    """Число подряд UTC-дней с активностью, считая от сегодня или вчера (если сегодня пусто)."""
    if today in active_days:
        anchor = today
    elif (today - timedelta(days=1)) in active_days:
        anchor = today - timedelta(days=1)
    else:
        return 0
    streak = 0
    d = anchor
    while d in active_days:
        streak += 1
        d -= timedelta(days=1)
    return streak


def task_completion_streak_utc(db: Session, user_id: UUID, today: date | None = None) -> int:
    """Подряд идущие UTC-календарные дни с хотя бы одной завершённой задачей (по completed_at)."""
    today = today or datetime.now(UTC).date()
    start_dt = utc_day_start(today - timedelta(days=400))
    ts_list = list(
        db.scalars(
            select(TaskModel.completed_at).where(
                TaskModel.user_id == user_id,
                TaskModel.completed_at.is_not(None),
                TaskModel.completed_at >= start_dt,
            )
        ).all()
    )
    active_days = {d for d, n in bucket_by_utc_date(ts_list).items() if n > 0}
    return completion_streak_from_active_days(active_days, today)


def build_day_activity(
    start: date,
    end: date,
    test_ts: list[datetime],
    hw_ts: list[datetime],
    done_ts: list[datetime] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    test_buckets = bucket_by_utc_date(test_ts)
    hw_buckets = bucket_by_utc_date(hw_ts)
    done_buckets = bucket_by_utc_date(done_ts or [])
    days_out: list[dict[str, Any]] = []
    for d in _daterange_inclusive(start, end):
        days_out.append(
            {
                "date": d,
                "test_attempts": test_buckets.get(d, 0),
                "homework_submissions": hw_buckets.get(d, 0),
                "tasks_completed": done_buckets.get(d, 0),
            }
        )
    totals = {
        "test_attempts": sum(test_buckets.values()),
        "homework_submissions": sum(hw_buckets.values()),
        "tasks_completed": sum(done_buckets.values()),
    }
    return days_out, totals
