from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.habit import HabitLog
from app.models.homework import HomeworkSubmission
from app.models.quiz import Test, TestAttempt
from app.models.roadmap import Task as TaskModel
from app.models.user import User
from app.schemas.habit import LeaderboardPublic, LeaderboardRowPublic

router = APIRouter()


@router.get("", response_model=LeaderboardPublic)
def get_leaderboard(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    period: str = Query(default="weekly"),
) -> LeaderboardPublic:
    _ = current  # auth guard only
    if period != "weekly":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only weekly period is supported")
    today = datetime.now(UTC).date()
    period_end = today
    period_start = today - timedelta(days=6)
    start_dt = datetime.combine(period_start, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(period_end + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    done_rows = db.execute(
        select(TaskModel.user_id, func.count())
        .where(
            TaskModel.status == "completed",
            TaskModel.completed_at.is_not(None),
            TaskModel.completed_at >= start_dt,
            TaskModel.completed_at < end_dt,
        )
        .group_by(TaskModel.user_id)
    ).all()
    habits_rows = db.execute(
        select(HabitLog.user_id, func.count())
        .where(
            HabitLog.completed.is_(True),
            HabitLog.log_date >= period_start,
            HabitLog.log_date <= period_end,
        )
        .group_by(HabitLog.user_id)
    ).all()
    tests_rows = db.execute(
        select(TaskModel.user_id, func.count())
        .select_from(TestAttempt)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(TaskModel, TaskModel.id == Test.task_id)
        .where(TestAttempt.created_at >= start_dt, TestAttempt.created_at < end_dt)
        .group_by(TaskModel.user_id)
    ).all()
    hw_rows = db.execute(
        select(HomeworkSubmission.user_id, func.count())
        .where(
            HomeworkSubmission.created_at >= start_dt,
            HomeworkSubmission.created_at < end_dt,
        )
        .group_by(HomeworkSubmission.user_id)
    ).all()

    done_map = {uid: int(n) for uid, n in done_rows}
    habits_map = {uid: int(n) for uid, n in habits_rows}
    tests_map = {uid: int(n) for uid, n in tests_rows}
    hw_map = {uid: int(n) for uid, n in hw_rows}
    user_ids = set(done_map) | set(habits_map) | set(tests_map) | set(hw_map)
    rows: list[LeaderboardRowPublic] = []
    for uid in user_ids:
        done_n = done_map.get(uid, 0)
        habits_n = habits_map.get(uid, 0)
        tests_n = tests_map.get(uid, 0)
        hw_n = hw_map.get(uid, 0)
        score = (done_n * 10) + (habits_n * 4) + (tests_n * 3) + (hw_n * 3)
        rows.append(
            LeaderboardRowPublic(
                rank=0,
                user_id=uid,
                score=score,
                tasks_completed=done_n,
                habits_completed=habits_n,
                tests_attempted=tests_n,
                homework_submissions=hw_n,
            )
        )
    rows.sort(key=lambda x: (x.score, x.tasks_completed, x.habits_completed), reverse=True)
    for i, row in enumerate(rows, start=1):
        row.rank = i
    return LeaderboardPublic(period="weekly", period_start=period_start, period_end=period_end, rows=rows[:20])
