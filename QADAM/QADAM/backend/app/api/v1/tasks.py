from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.database import get_db
from app.models.goal import Goal
from app.models.roadmap import Task as TaskModel
from app.models.user import User
from app.schemas.learning_resource import LearningResourcePublic
from app.schemas.task import TaskDuePatch, TaskListItem, TaskRescheduleBody, TaskStatusPatch
from app.services.progress_journal import append_progress_log
from app.services.youtube_resources import list_resources, replace_resources_for_task

router = APIRouter()


def _utc_day_range(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=UTC)
    end = datetime.combine(d + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end


def _task_for_user(db: Session, task_id: UUID, user: User) -> TaskModel:
    task = db.get(TaskModel, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("", response_model=list[TaskListItem])
def list_tasks(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    day: date | None = Query(default=None, alias="date"),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    goal_id: UUID | None = None,
    include_undated: bool = False,
) -> list[TaskModel]:
    stmt = select(TaskModel).where(TaskModel.user_id == current.id)

    if goal_id is not None:
        goal = db.get(Goal, goal_id)
        if goal is None or goal.user_id != current.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
        stmt = stmt.where(TaskModel.goal_id == goal_id)

    if from_date is not None or to_date is not None:
        range_start = from_date if from_date is not None else (day if day is not None else datetime.now(UTC).date())
        range_end = to_date if to_date is not None else range_start
        if range_end < range_start:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="to_date must be >= from_date")
        start, _ = _utc_day_range(range_start)
        _, end = _utc_day_range(range_end)
        in_range = and_(TaskModel.due_at.is_not(None), TaskModel.due_at >= start, TaskModel.due_at < end)
        if include_undated:
            stmt = stmt.where(or_(in_range, TaskModel.due_at.is_(None)))
        else:
            stmt = stmt.where(in_range)
    else:
        target = day if day is not None else datetime.now(UTC).date()
        start, end = _utc_day_range(target)
        in_day = and_(TaskModel.due_at.is_not(None), TaskModel.due_at >= start, TaskModel.due_at < end)
        if include_undated:
            stmt = stmt.where(or_(in_day, TaskModel.due_at.is_(None)))
        else:
            stmt = stmt.where(in_day)

    stmt = stmt.order_by(TaskModel.due_at.asc().nulls_last(), TaskModel.created_at.asc())
    return list(db.scalars(stmt).all())


@router.get("/{task_id}", response_model=TaskListItem)
def get_task(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TaskModel:
    return _task_for_user(db, task_id, current)


@router.patch("/{task_id}/status", response_model=TaskListItem)
def patch_task_status(
    task_id: UUID,
    payload: TaskStatusPatch,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TaskModel:
    task = _task_for_user(db, task_id, current)
    task.status = payload.status
    if payload.status == "completed":
        task.completed_at = datetime.now(UTC)
        append_progress_log(
            db,
            user_id=current.id,
            event_type="task_completed",
            goal_id=task.goal_id,
            task_id=task.id,
            payload={"title": task.title},
        )
    else:
        task.completed_at = None
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _apply_task_due(task: TaskModel, payload: TaskDuePatch) -> None:
    if payload.due_at is None:
        task.due_at = None
    else:
        dt = payload.due_at
        aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
        task.due_at = aware.astimezone(UTC)


@router.patch("/{task_id}/due", response_model=TaskListItem)
def patch_task_due(
    task_id: UUID,
    payload: TaskDuePatch,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TaskModel:
    task = _task_for_user(db, task_id, current)
    _apply_task_due(task, payload)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/reschedule", response_model=TaskListItem)
def reschedule_task(
    task_id: UUID,
    payload: TaskRescheduleBody,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TaskModel:
    """Новый дедлайн (UTC). Для снятия даты используйте PATCH …/due с null."""
    task = _task_for_user(db, task_id, current)
    _apply_task_due(task, TaskDuePatch(due_at=payload.due_at))
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}/resources", response_model=list[LearningResourcePublic])
def get_task_resources(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[LearningResourcePublic]:
    task = _task_for_user(db, task_id, current)
    return list_resources(db, task_id=task.id)


@router.post(
    "/{task_id}/resources/generate",
    response_model=list[LearningResourcePublic],
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("24/hour")
def generate_task_resources(
    request: Request,
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[LearningResourcePublic]:
    task = _task_for_user(db, task_id, current)
    return replace_resources_for_task(db, task)
