from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_superuser
from app.models.admin_audit_log import AdminAuditLog
from app.models.goal import Goal
from app.models.homework import HomeworkSubmission
from app.models.quiz import Test, TestAttempt
from app.models.roadmap import Roadmap, Task as TaskModel
from app.models.user import User
from app.schemas.admin import (
    AdminAuditLogPublic,
    AdminRoadmapRow,
    AdminUserPatch,
    AdminUserProgressPublic,
    AdminUserRow,
    RoadmapAdminPatch,
    RoadmapStatusPublic,
)
from app.services.admin_audit import append_admin_audit
from app.services.progress_stats import tasks_by_status

router = APIRouter()


@router.get("/audit-logs", response_model=list[AdminAuditLogPublic])
def list_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_superuser)],
    limit: int = Query(default=80, ge=1, le=500),
    action: str | None = Query(default=None, description="Точное совпадение action (например user.patch_active)"),
) -> list[AdminAuditLogPublic]:
    stmt = (
        select(AdminAuditLog, User.email)
        .join(User, User.id == AdminAuditLog.actor_user_id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(limit)
    )
    if action is not None and action.strip() != "":
        stmt = stmt.where(AdminAuditLog.action == action.strip())
    rows = db.execute(stmt).all()
    out: list[AdminAuditLogPublic] = []
    for log, actor_email in rows:
        out.append(
            AdminAuditLogPublic(
                id=log.id,
                actor_user_id=log.actor_user_id,
                actor_email=str(actor_email),
                action=log.action,
                target_type=log.target_type,
                target_id=log.target_id,
                payload=log.payload,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at,
            )
        )
    return out


@router.get("/users", response_model=list[AdminUserRow])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_superuser)],
) -> list[User]:
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return list(rows)


@router.patch("/users/{user_id}", response_model=AdminUserRow)
def admin_patch_user(
    user_id: UUID,
    payload: AdminUserPatch,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    actor: Annotated[User, Depends(require_superuser)],
) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    data = payload.model_dump(exclude_unset=True)

    if "is_active" in data:
        new_active = bool(data["is_active"])
        if target.id == actor.id and not new_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )
        old = target.is_active
        target.is_active = new_active
        if old != new_active:
            append_admin_audit(
                db,
                actor=actor,
                action="user.patch_active",
                target_type="user",
                target_id=target.id,
                payload={"from": old, "to": new_active, "email": target.email},
                request=request,
            )

    if "is_superuser" in data:
        new_su = bool(data["is_superuser"])
        if target.id == actor.id and not new_su:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot revoke your own superuser flag",
            )
        if not new_su and target.is_superuser:
            others = int(
                db.scalar(
                    select(func.count())
                    .select_from(User)
                    .where(User.is_superuser.is_(True), User.is_active.is_(True), User.id != target.id)
                )
                or 0
            )
            if others < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last active superuser",
                )
        old_su = target.is_superuser
        target.is_superuser = new_su
        if old_su != new_su:
            append_admin_audit(
                db,
                actor=actor,
                action="user.patch_superuser",
                target_type="user",
                target_id=target.id,
                payload={"from": old_su, "to": new_su, "email": target.email},
                request=request,
            )

    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.get("/users/{user_id}/progress", response_model=AdminUserProgressPublic)
def admin_user_progress(
    user_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_superuser)],
) -> AdminUserProgressPublic:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    now = datetime.now(UTC)
    week_start = now - timedelta(days=7)

    goals_total = int(db.scalar(select(func.count()).select_from(Goal).where(Goal.user_id == user_id)) or 0)
    goals_active = int(
        db.scalar(select(func.count()).select_from(Goal).where(Goal.user_id == user_id, Goal.status == "active")) or 0
    )
    tasks_total = int(db.scalar(select(func.count()).select_from(TaskModel).where(TaskModel.user_id == user_id)) or 0)
    by_status = tasks_by_status(db, user_id)
    active_rm = int(
        db.scalar(
            select(func.count()).select_from(Roadmap).where(Roadmap.user_id == user_id, Roadmap.status == "active")
        )
        or 0
    )
    tests_7d = int(
        db.scalar(
            select(func.count())
            .select_from(TestAttempt)
            .join(Test, Test.id == TestAttempt.test_id)
            .join(TaskModel, TaskModel.id == Test.task_id)
            .where(TaskModel.user_id == user_id, TestAttempt.created_at >= week_start)
        )
        or 0
    )
    hw_7d = int(
        db.scalar(
            select(func.count())
            .select_from(HomeworkSubmission)
            .where(HomeworkSubmission.user_id == user_id, HomeworkSubmission.created_at >= week_start)
        )
        or 0
    )
    done_7d = int(
        db.scalar(
            select(func.count())
            .select_from(TaskModel)
            .where(
                TaskModel.user_id == user_id,
                TaskModel.status == "completed",
                TaskModel.completed_at.is_not(None),
                TaskModel.completed_at >= week_start,
            )
        )
        or 0
    )

    return AdminUserProgressPublic(
        user_id=user.id,
        email=user.email,
        goals_total=goals_total,
        goals_active=goals_active,
        tasks_total=tasks_total,
        tasks_by_status=by_status,
        active_roadmaps=active_rm,
        tests_attempts_last_7_days=tests_7d,
        homework_submissions_last_7_days=hw_7d,
        tasks_completed_last_7_days=done_7d,
    )


@router.get("/roadmaps", response_model=list[AdminRoadmapRow])
def list_roadmaps(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_superuser)],
    status_filter: str | None = Query(default=None, alias="status"),
    user_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AdminRoadmapRow]:
    stmt = (
        select(
            Roadmap.id,
            Roadmap.goal_id,
            Roadmap.user_id,
            Roadmap.version,
            Roadmap.status,
            Roadmap.created_at,
            Goal.title.label("goal_title"),
            User.email.label("user_email"),
        )
        .join(Goal, Goal.id == Roadmap.goal_id)
        .join(User, User.id == Roadmap.user_id)
        .order_by(Roadmap.created_at.desc())
        .limit(limit)
    )
    if status_filter is not None and status_filter.strip() != "":
        key = status_filter.strip().lower()
        stmt = stmt.where(Roadmap.status == key)
    if user_id is not None:
        stmt = stmt.where(Roadmap.user_id == user_id)
    rows = db.execute(stmt).all()
    return [
        AdminRoadmapRow(
            id=r.id,
            goal_id=r.goal_id,
            user_id=r.user_id,
            user_email=str(r.user_email),
            goal_title=r.goal_title,
            version=r.version,
            status=r.status,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.patch("/roadmaps/{roadmap_id}", response_model=RoadmapStatusPublic)
def admin_patch_roadmap(
    roadmap_id: UUID,
    payload: RoadmapAdminPatch,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    actor: Annotated[User, Depends(require_superuser)],
) -> Roadmap:
    rm = db.get(Roadmap, roadmap_id)
    if rm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Roadmap not found")
    old_status = rm.status
    rm.status = payload.status
    append_admin_audit(
        db,
        actor=actor,
        action="roadmap.patch_status",
        target_type="roadmap",
        target_id=rm.id,
        payload={
            "from_status": old_status,
            "to_status": payload.status,
            "goal_id": str(rm.goal_id),
            "roadmap_owner_user_id": str(rm.user_id),
        },
        request=request,
    )
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm
