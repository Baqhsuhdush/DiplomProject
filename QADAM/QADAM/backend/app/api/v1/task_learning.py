import re
import uuid
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.tasks import _task_for_user
from app.core.rate_limit import limiter
from app.config import get_settings
from app.database import get_db
from app.models.goal import Goal
from app.models.homework import HomeworkSubmission
from app.models.quiz import Test, TestAttempt
from app.models.user import User
from app.schemas.homework import HomeworkViewPublic
from app.schemas.quiz import TestViewPublic, strip_correct_answers
from app.services.homework_ai import grade_homework
from app.services.quiz_ai import build_quiz_for_task

router = APIRouter()


def _test_to_public(test: Test) -> TestViewPublic:
    return TestViewPublic(
        id=test.id,
        task_id=test.task_id,
        test_type=test.test_type,
        created_at=test.created_at,
        content=strip_correct_answers(test.questions_json),
    )


def _homework_to_public(row: HomeworkSubmission) -> HomeworkViewPublic:
    dl = f"/api/v1/homework/{row.id}/file" if row.file_path else None
    return HomeworkViewPublic(
        id=row.id,
        task_id=row.task_id,
        text_answer=row.text_answer,
        original_filename=row.original_filename,
        ai_feedback=row.ai_feedback,
        grade=row.grade,
        created_at=row.created_at,
        download_path=dl,
    )


@router.post("/{task_id}/tests/generate", response_model=TestViewPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
def generate_test_for_task(
    request: Request,
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    lang: str = Query(default="ru"),
) -> TestViewPublic:
    task = _task_for_user(db, task_id, current)
    attempts_count = int(
        db.scalar(
            select(func.count())
            .select_from(TestAttempt)
            .join(Test, Test.id == TestAttempt.test_id)
            .where(Test.task_id == task.id, TestAttempt.user_id == current.id)
        )
        or 0
    )
    if attempts_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Test for this task was already completed",
        )
    blob = build_quiz_for_task(db, task, lang=lang)
    if not blob.get("questions"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not build quiz",
        )
    passing = int(blob.get("passing_score", 60))
    test = Test(
        task_id=task.id,
        test_type="quiz",
        questions_json=blob,
        passing_score=passing,
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return _test_to_public(test)


@router.get("/{task_id}/tests/latest", response_model=TestViewPublic)
def get_latest_test(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TestViewPublic:
    task = _task_for_user(db, task_id, current)
    test = db.scalar(
        select(Test).where(Test.task_id == task.id).order_by(Test.created_at.desc()).limit(1)
    )
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No test for this task")
    return _test_to_public(test)


@router.post(
    "/{task_id}/homework/submit",
    response_model=HomeworkViewPublic,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/hour")
async def submit_homework(
    request: Request,
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    text_answer: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
) -> HomeworkViewPublic:
    settings = get_settings()
    task = _task_for_user(db, task_id, current)
    text = (text_answer or "").strip() or None
    raw: bytes | None = None
    orig_name: str | None = None
    if file is not None and file.filename:
        raw = await file.read()
        orig_name = file.filename
        if not raw:
            raw = None

    if not text and not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide text_answer and/or a non-empty file",
        )

    max_bytes = max(1, settings.max_upload_mb) * 1024 * 1024
    if raw is not None and len(raw) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    rel_path: str | None = None
    if raw is not None and orig_name:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(orig_name).name)[:180]
        ext = Path(safe).suffix[:12] if "." in safe else ""
        fname = f"{uuid.uuid4().hex}{ext}"
        base = Path(settings.upload_dir).resolve() / str(current.id) / str(task.id)
        base.mkdir(parents=True, exist_ok=True)
        dest = base / fname
        dest.write_bytes(raw)
        rel_path = f"{current.id}/{task.id}/{fname}"

    goal = db.get(Goal, task.goal_id)
    goal_title = goal.title if goal else ""

    fb, gr = grade_homework(task_title=task.title, goal_title=goal_title, text=text)

    row = HomeworkSubmission(
        task_id=task.id,
        user_id=current.id,
        text_answer=text,
        file_path=rel_path,
        original_filename=orig_name if rel_path else None,
        ai_feedback=fb,
        grade=gr,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _homework_to_public(row)


@router.get("/{task_id}/homework/latest", response_model=HomeworkViewPublic)
def get_latest_homework(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> HomeworkViewPublic:
    task = _task_for_user(db, task_id, current)
    row = db.scalar(
        select(HomeworkSubmission)
        .where(HomeworkSubmission.task_id == task.id, HomeworkSubmission.user_id == current.id)
        .order_by(HomeworkSubmission.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No homework submission")
    return _homework_to_public(row)
