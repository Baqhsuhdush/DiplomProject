from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1 import (
    admin,
    auth,
    goals,
    habits,
    homework_files,
    leaderboard,
    me_notifications,
    me_settings,
    me_telegram,
    progress,
    reports,
    task_learning,
    tasks,
    telegram_routes,
    tests_attempt,
)
from app.database import get_db
from app.models.goal import Goal
from app.models.user import User
from app.schemas.roadmap import RoadmapPublic
from app.schemas.user import UserPublic
from app.services.roadmap_ai import load_roadmap_detail, serialize_roadmap

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(goals.router, prefix="/goals", tags=["goals"])
api_router.include_router(habits.router, prefix="/habits", tags=["habits"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(progress.router, prefix="/progress", tags=["progress"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(task_learning.router, prefix="/tasks", tags=["learning"])
api_router.include_router(tests_attempt.router, prefix="/tests", tags=["tests"])
api_router.include_router(homework_files.router, prefix="/homework", tags=["homework"])
api_router.include_router(me_telegram.router, prefix="/me", tags=["telegram"])
api_router.include_router(me_notifications.router, prefix="/me", tags=["notifications"])
api_router.include_router(me_settings.router, prefix="/me", tags=["me"])
api_router.include_router(telegram_routes.router, prefix="/telegram", tags=["telegram"])


@api_router.get("/me", response_model=UserPublic)
def read_me(current: Annotated[User, Depends(get_current_user)]) -> User:
    return current


@api_router.get("/roadmaps/{goal_id}", response_model=RoadmapPublic, tags=["roadmaps"])
def read_roadmap_by_goal(
    goal_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> RoadmapPublic:
    goal = db.get(Goal, goal_id)
    if goal is None or goal.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    loaded = load_roadmap_detail(db, goal_id=goal_id, user_id=current.id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active roadmap for this goal",
        )
    return serialize_roadmap(loaded)
