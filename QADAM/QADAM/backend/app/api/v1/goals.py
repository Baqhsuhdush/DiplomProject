from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.database import get_db
from app.models.assessment import Assessment
from app.models.goal import Goal
from app.models.user import User
from app.schemas.assessment import AssessmentCreate, AssessmentPublic
from app.schemas.goal import GoalCreate, GoalPublic, GoalUpdate
from app.schemas.roadmap import RoadmapPublic
from app.services.progress_journal import append_progress_log
from app.services.roadmap_ai import build_plan, load_roadmap_detail, persist_roadmap, serialize_roadmap

router = APIRouter()


def _goal_for_user(db: Session, goal_id: UUID, user: User) -> Goal:
    goal = db.get(Goal, goal_id)
    if goal is None or goal.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.post("", response_model=GoalPublic, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Goal:
    goal = Goal(
        user_id=current.id,
        domain=payload.domain,
        title=payload.title.strip(),
        target_date=payload.target_date,
        priority=payload.priority,
        status="active",
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("", response_model=list[GoalPublic])
def list_goals(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == current.id).order_by(Goal.created_at.desc())
    if status_filter is not None:
        key = status_filter.strip().lower()
        stmt = stmt.where(Goal.status == key)
    return list(db.scalars(stmt).all())


@router.post(
    "/{goal_id}/roadmap/generate",
    response_model=RoadmapPublic,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("8/hour")
def generate_roadmap(
    request: Request,
    goal_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    lang: str = Query(default="ru"),
) -> RoadmapPublic:
    goal = _goal_for_user(db, goal_id, current)
    plan = build_plan(db, goal, lang=lang)
    if not plan.steps:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not build roadmap plan",
        )
    persist_roadmap(db, user_id=current.id, goal=goal, plan=plan)
    loaded = load_roadmap_detail(db, goal_id=goal.id, user_id=current.id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Roadmap was not persisted",
        )
    return serialize_roadmap(loaded)


@router.get("/{goal_id}/roadmap", response_model=RoadmapPublic)
def get_active_roadmap(
    goal_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> RoadmapPublic:
    _goal_for_user(db, goal_id, current)
    loaded = load_roadmap_detail(db, goal_id=goal_id, user_id=current.id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active roadmap for this goal",
        )
    return serialize_roadmap(loaded)


@router.get("/{goal_id}", response_model=GoalPublic)
def get_goal(
    goal_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Goal:
    return _goal_for_user(db, goal_id, current)


@router.patch("/{goal_id}", response_model=GoalPublic)
def update_goal(
    goal_id: UUID,
    payload: GoalUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Goal:
    goal = _goal_for_user(db, goal_id, current)
    old_status = goal.status
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        goal.title = data["title"].strip()
    if "target_date" in data:
        goal.target_date = data["target_date"]
    if "priority" in data:
        goal.priority = data["priority"]
    if "status" in data and data["status"] is not None:
        goal.status = data["status"]
    if goal.status != old_status:
        append_progress_log(
            db,
            user_id=current.id,
            event_type="goal_status_changed",
            goal_id=goal.id,
            payload={"from": old_status, "to": goal.status},
        )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get("/{goal_id}/assessment/latest", response_model=AssessmentPublic)
def get_latest_assessment(
    goal_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Assessment:
    _goal_for_user(db, goal_id, current)
    row = db.scalar(
        select(Assessment)
        .where(Assessment.goal_id == goal_id)
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No assessment yet")
    return row


@router.post(
    "/{goal_id}/assessment",
    response_model=AssessmentPublic,
    status_code=status.HTTP_201_CREATED,
)
def submit_assessment(
    goal_id: UUID,
    payload: AssessmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Assessment:
    _goal_for_user(db, goal_id, current)
    row = Assessment(
        user_id=current.id,
        goal_id=goal_id,
        answers=payload.answers,
        ai_summary=None,
    )
    db.add(row)
    append_progress_log(
        db,
        user_id=current.id,
        event_type="assessment_submitted",
        goal_id=goal_id,
        payload={"assessment_id": str(row.id)},
    )
    db.commit()
    db.refresh(row)
    return row
