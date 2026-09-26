from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.quiz import Test, TestAttempt
from app.models.roadmap import Task as TaskModel
from app.models.user import User
from app.schemas.quiz import AttemptCreate, AttemptResultPublic
from app.services.quiz_score import score_attempt

router = APIRouter()


def _attempt_details(test: Test, answers: dict[str, object]) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    qs = test.questions_json.get("questions", []) if isinstance(test.questions_json, dict) else []
    for q in qs:
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id") or "")
        if not qid:
            continue
        qtype = str(q.get("type", "mcq")).lower()
        user_val = answers.get(qid)
        correct_val: object | None = None
        is_correct = False
        if qtype == "mcq":
            correct_val = q.get("correct_index")
            try:
                if user_val is not None and correct_val is not None:
                    is_correct = int(user_val) == int(correct_val)
            except (TypeError, ValueError):
                is_correct = False
        elif qtype == "short_text":
            correct_val = q.get("correct_answer")
            ref = (correct_val or "").strip().lower() if isinstance(correct_val, str) else ""
            given = str(user_val or "").strip().lower()
            if ref:
                is_correct = given == ref
            else:
                is_correct = len(given) >= 8
        out.append(
            {
                "question_id": qid,
                "type": qtype,
                "is_correct": is_correct,
                "user_answer": user_val,
                "correct_answer": correct_val,
            }
        )
    return out


@router.post("/{test_id}/attempt", response_model=AttemptResultPublic, status_code=status.HTTP_201_CREATED)
def submit_test_attempt(
    test_id: UUID,
    payload: AttemptCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> AttemptResultPublic:
    test = db.get(Test, test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    task = db.get(TaskModel, test.task_id)
    if task is None or task.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    already = int(
        db.scalar(
            select(func.count())
            .select_from(TestAttempt)
            .where(TestAttempt.test_id == test.id, TestAttempt.user_id == current.id)
        )
        or 0
    )
    if already > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Test attempt already submitted")

    score, passed = score_attempt(test.questions_json, payload.answers)
    attempt = TestAttempt(
        test_id=test.id,
        user_id=current.id,
        answers_json=payload.answers,
        score=score,
        passed=passed,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return AttemptResultPublic(
        id=attempt.id,
        test_id=test.id,
        score=score,
        passed=passed,
        passing_score=test.passing_score,
        created_at=attempt.created_at,
        details=_attempt_details(test, payload.answers),
    )


@router.get("/{test_id}/attempt/latest", response_model=AttemptResultPublic)
def get_latest_test_attempt(
    test_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> AttemptResultPublic:
    test = db.get(Test, test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    task = db.get(TaskModel, test.task_id)
    if task is None or task.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    attempt = db.scalar(
        select(TestAttempt)
        .where(TestAttempt.test_id == test.id, TestAttempt.user_id == current.id)
        .order_by(TestAttempt.created_at.desc())
        .limit(1)
    )
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No attempts")
    return AttemptResultPublic(
        id=attempt.id,
        test_id=test.id,
        score=attempt.score,
        passed=attempt.passed,
        passing_score=test.passing_score,
        created_at=attempt.created_at,
        details=_attempt_details(test, attempt.answers_json if isinstance(attempt.answers_json, dict) else {}),
    )
