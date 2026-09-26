from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.habit import Habit, HabitLog
from app.models.user import User
from app.schemas.habit import (
    HabitCheckPublic,
    HabitCheckRequest,
    HabitCreateRequest,
    HabitPublic,
)
from app.services.progress_stats import completion_streak_from_active_days

router = APIRouter()


def _today_utc() -> date:
    return datetime.now(UTC).date()


@router.get("", response_model=list[HabitPublic])
def list_habits(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[HabitPublic]:
    today = _today_utc()
    habits = list(
        db.scalars(
            select(Habit)
            .where(Habit.user_id == current.id, Habit.is_active.is_(True))
            .order_by(Habit.created_at.asc())
        ).all()
    )
    if not habits:
        return []

    habit_ids = [h.id for h in habits]
    today_done = set(
        db.scalars(
            select(HabitLog.habit_id).where(
                HabitLog.user_id == current.id,
                HabitLog.habit_id.in_(habit_ids),
                HabitLog.log_date == today,
                HabitLog.completed.is_(True),
            )
        ).all()
    )

    streak_rows = db.execute(
        select(HabitLog.habit_id, HabitLog.log_date)
        .where(
            HabitLog.user_id == current.id,
            HabitLog.habit_id.in_(habit_ids),
            HabitLog.completed.is_(True),
            HabitLog.log_date >= today - timedelta(days=180),
        )
        .order_by(HabitLog.log_date.desc())
    ).all()
    by_habit: dict[UUID, set[date]] = {}
    for habit_id, log_date in streak_rows:
        by_habit.setdefault(habit_id, set()).add(log_date)

    out: list[HabitPublic] = []
    for h in habits:
        out.append(
            HabitPublic(
                id=h.id,
                user_id=h.user_id,
                title=h.title,
                description=h.description,
                is_active=h.is_active,
                created_at=h.created_at,
                completed_today=h.id in today_done,
                current_streak_days=completion_streak_from_active_days(by_habit.get(h.id, set()), today),
            )
        )
    return out


@router.post("", response_model=HabitPublic, status_code=status.HTTP_201_CREATED)
def create_habit(
    payload: HabitCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> HabitPublic:
    row = Habit(
        user_id=current.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return HabitPublic(
        id=row.id,
        user_id=row.user_id,
        title=row.title,
        description=row.description,
        is_active=row.is_active,
        created_at=row.created_at,
        completed_today=False,
        current_streak_days=0,
    )


@router.post("/{habit_id}/check", response_model=HabitCheckPublic)
def check_habit(
    habit_id: UUID,
    payload: HabitCheckRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> HabitCheckPublic:
    habit = db.scalar(select(Habit).where(and_(Habit.id == habit_id, Habit.user_id == current.id, Habit.is_active.is_(True))))
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    log_date = payload.log_date or _today_utc()
    row = db.scalar(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            HabitLog.user_id == current.id,
            HabitLog.log_date == log_date,
        )
    )
    if row is None:
        row = HabitLog(habit_id=habit_id, user_id=current.id, log_date=log_date, completed=payload.completed)
    else:
        row.completed = payload.completed
    db.add(row)
    db.commit()
    return HabitCheckPublic(habit_id=habit_id, log_date=log_date, completed=payload.completed)
