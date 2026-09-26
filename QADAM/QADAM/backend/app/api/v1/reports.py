from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.progress import DayActivityPublic, MonthlyReportPublic, WeeklyReportPublic
from app.services.progress_stats import (
    build_day_activity,
    homework_timestamps_in_range,
    task_completions_in_range,
    test_attempts_in_range,
    utc_day_end_exclusive,
    utc_day_start,
)

router = APIRouter()


def _utc_today() -> date:
    return datetime.now(UTC).date()


@router.get("/weekly", response_model=WeeklyReportPublic)
def report_weekly(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> WeeklyReportPublic:
    end_d = _utc_today()
    start_d = end_d - timedelta(days=6)
    t0 = utc_day_start(start_d)
    t1 = utc_day_end_exclusive(end_d)
    test_ts = test_attempts_in_range(db, current.id, t0, t1)
    hw_ts = homework_timestamps_in_range(db, current.id, t0, t1)
    done_ts = task_completions_in_range(db, current.id, t0, t1)
    days_raw, totals = build_day_activity(start_d, end_d, test_ts, hw_ts, done_ts)
    days = [DayActivityPublic(**d) for d in days_raw]
    return WeeklyReportPublic(period_start=start_d, period_end=end_d, days=days, totals=totals)


@router.get("/monthly", response_model=MonthlyReportPublic)
def report_monthly(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MonthlyReportPublic:
    end_d = _utc_today()
    start_d = end_d - timedelta(days=29)
    t0 = utc_day_start(start_d)
    t1 = utc_day_end_exclusive(end_d)
    test_ts = test_attempts_in_range(db, current.id, t0, t1)
    hw_ts = homework_timestamps_in_range(db, current.id, t0, t1)
    done_ts = task_completions_in_range(db, current.id, t0, t1)
    days_raw, totals = build_day_activity(start_d, end_d, test_ts, hw_ts, done_ts)
    days = [DayActivityPublic(**d) for d in days_raw]
    return MonthlyReportPublic(period_start=start_d, period_end=end_d, days=days, totals=totals)
