from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.goal import Goal
from app.models.habit import HabitLog
from app.models.progress_log import ProgressLog
from app.models.homework import HomeworkSubmission
from app.models.quiz import Test, TestAttempt
from app.models.roadmap import Task as TaskModel
from app.models.user import User
from app.schemas.progress import (
    PredictiveInsightPublic,
    ProgressChartsPublic,
    ProgressLogItemPublic,
    ProgressOverviewPublic,
    ProgressRecommendationsPublic,
)
from app.services.predictive_insights import build_predictive_insight
from app.services.progress_ai import build_progress_recommendations
from app.services.progress_stats import (
    overdue_open_tasks_count,
    task_completion_streak_utc,
    task_completions_in_range,
    tasks_by_status,
)

router = APIRouter()


@router.get("/logs", response_model=list[ProgressLogItemPublic])
def list_progress_logs(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[ProgressLog]:
    stmt = (
        select(ProgressLog)
        .where(ProgressLog.user_id == current.id)
        .order_by(ProgressLog.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.get("/overview", response_model=ProgressOverviewPublic)
def progress_overview(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ProgressOverviewPublic:
    now = datetime.now(UTC)
    week_start = now - timedelta(days=7)

    goals_total = int(db.scalar(select(func.count()).select_from(Goal).where(Goal.user_id == current.id)) or 0)
    goals_active = int(
        db.scalar(
            select(func.count()).select_from(Goal).where(Goal.user_id == current.id, Goal.status == "active")
        )
        or 0
    )
    tasks_total = int(
        db.scalar(select(func.count()).select_from(TaskModel).where(TaskModel.user_id == current.id)) or 0
    )
    by_status = tasks_by_status(db, current.id)

    overdue = overdue_open_tasks_count(db, current.id, now)
    streak = task_completion_streak_utc(db, current.id, now.date())

    tests_7d = int(
        db.scalar(
            select(func.count())
            .select_from(TestAttempt)
            .join(Test, Test.id == TestAttempt.test_id)
            .join(TaskModel, TaskModel.id == Test.task_id)
            .where(TaskModel.user_id == current.id, TestAttempt.created_at >= week_start)
        )
        or 0
    )

    hw_7d = int(
        db.scalar(
            select(func.count())
            .select_from(HomeworkSubmission)
            .where(HomeworkSubmission.user_id == current.id, HomeworkSubmission.created_at >= week_start)
        )
        or 0
    )

    done_7d = int(
        db.scalar(
            select(func.count())
            .select_from(TaskModel)
            .where(
                TaskModel.user_id == current.id,
                TaskModel.status == "completed",
                TaskModel.completed_at.is_not(None),
                TaskModel.completed_at >= week_start,
            )
        )
        or 0
    )

    return ProgressOverviewPublic(
        generated_at=now,
        goals_total=goals_total,
        goals_active=goals_active,
        tasks_total=tasks_total,
        tasks_by_status=by_status,
        overdue_open_tasks=overdue,
        task_completion_streak_days=streak,
        tests_attempts_last_7_days=tests_7d,
        homework_submissions_last_7_days=hw_7d,
        tasks_completed_last_7_days=done_7d,
    )


@router.get("/recommendations", response_model=ProgressRecommendationsPublic)
def progress_recommendations(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    lang: str = Query(default="ru"),
) -> ProgressRecommendationsPublic:
    now = datetime.now(UTC)
    norm_lang = lang if lang in {"kk", "ru", "en"} else "ru"
    by_status = tasks_by_status(db, current.id)
    tasks_total = int(
        db.scalar(select(func.count()).select_from(TaskModel).where(TaskModel.user_id == current.id)) or 0
    )
    completed_count = int(by_status.get("completed", 0))
    goals_active = int(
        db.scalar(
            select(func.count()).select_from(Goal).where(Goal.user_id == current.id, Goal.status == "active")
        )
        or 0
    )
    overdue = overdue_open_tasks_count(db, current.id, now)
    streak = task_completion_streak_utc(db, current.id, now.date())
    next_milestone = 7 if streak < 7 else 30 if streak < 30 else 60
    tips = build_progress_recommendations(
        lang=norm_lang,
        goals_active=goals_active,
        tasks_total=tasks_total,
        completed_count=completed_count,
        overdue_open_tasks=overdue,
        streak_days=streak,
    )
    return ProgressRecommendationsPublic(
        generated_at=now,
        next_milestone=next_milestone,
        streak_to_go=max(0, next_milestone - streak),
        tips=tips,
    )


@router.get("/charts", response_model=ProgressChartsPublic)
def progress_charts(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ProgressChartsPublic:
    now = datetime.now(UTC)
    end_day = now.date()
    start_day = end_day - timedelta(days=13)
    start_dt = datetime.combine(start_day, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_day + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    completed_ts = task_completions_in_range(db, current.id, start_dt, end_dt)
    habits_rows = db.execute(
        select(HabitLog.log_date, func.count())
        .where(
            HabitLog.user_id == current.id,
            HabitLog.completed.is_(True),
            HabitLog.log_date >= start_day,
            HabitLog.log_date <= end_day,
        )
        .group_by(HabitLog.log_date)
    ).all()
    habits_map = {d: int(n) for d, n in habits_rows}
    done_map: dict[date, int] = {}
    for ts in completed_ts:
        d = ts.astimezone(UTC).date()
        done_map[d] = done_map.get(d, 0) + 1

    completion_series: list[dict[str, int | str]] = []
    habits_series: list[dict[str, int | str]] = []
    for i in range(14):
        d = start_day + timedelta(days=i)
        completion_series.append({"date": d.isoformat(), "value": done_map.get(d, 0)})
        habits_series.append({"date": d.isoformat(), "value": habits_map.get(d, 0)})
    return ProgressChartsPublic(
        generated_at=now,
        period_start=start_day,
        period_end=end_day,
        completion_series=completion_series,
        habits_series=habits_series,
    )


@router.get("/predictive-insights", response_model=PredictiveInsightPublic)
def predictive_insights(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    lang: str = Query(default="ru"),
) -> PredictiveInsightPublic:
    now = datetime.now(UTC)
    norm_lang = lang if lang in {"kk", "ru", "en"} else "ru"
    streak = task_completion_streak_utc(db, current.id, now.date())
    overdue = overdue_open_tasks_count(db, current.id, now)
    week_start = now - timedelta(days=7)
    done_7d = int(
        db.scalar(
            select(func.count())
            .select_from(TaskModel)
            .where(
                TaskModel.user_id == current.id,
                TaskModel.status == "completed",
                TaskModel.completed_at.is_not(None),
                TaskModel.completed_at >= week_start,
            )
        )
        or 0
    )
    completion_velocity = round(done_7d / 7.0, 2)
    payload = build_predictive_insight(
        lang=norm_lang,
        overdue_open_tasks=overdue,
        completion_velocity_per_day=completion_velocity,
        streak_days=streak,
    )
    return PredictiveInsightPublic(
        generated_at=now,
        completion_velocity_per_day=completion_velocity,
        overdue_risk_score=int(payload["overdue_risk_score"]),
        streak_trend=str(payload["streak_trend"]),
        next_7_days_focus=[str(x) for x in payload.get("next_7_days_focus", [])],
        explanation=str(payload["explanation"]),
    )
