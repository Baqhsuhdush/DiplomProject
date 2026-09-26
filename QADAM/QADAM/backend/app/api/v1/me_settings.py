from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import (
    ReminderQuietHoursUpdate,
    UserChangeEmailRequest,
    UserChangePasswordRequest,
    UserProfileUpdate,
    UserPublic,
    UserTimezoneUpdate,
)

router = APIRouter()


@router.patch("/profile", response_model=UserPublic)
def patch_user_profile(
    payload: UserProfileUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> User:
    data = payload.model_dump(exclude_unset=True)
    if "full_name" in data:
        current.full_name = data["full_name"]
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


@router.patch("/timezone", response_model=UserPublic)
def patch_user_timezone(
    payload: UserTimezoneUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> User:
    current.timezone = payload.timezone
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


@router.patch("/reminder-quiet", response_model=UserPublic)
def patch_reminder_quiet_hours(
    payload: ReminderQuietHoursUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> User:
    current.reminder_quiet_enabled = payload.reminder_quiet_enabled
    if payload.reminder_quiet_enabled:
        current.reminder_quiet_start_hour_local = payload.reminder_quiet_start_hour_local
        current.reminder_quiet_end_hour_local = payload.reminder_quiet_end_hour_local
    else:
        current.reminder_quiet_start_hour_local = None
        current.reminder_quiet_end_hour_local = None
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


@router.patch("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: UserChangePasswordRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Response:
    if not verify_password(payload.current_password, current.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    current.password_hash = hash_password(payload.new_password)
    db.add(current)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/email", response_model=UserPublic)
def change_email(
    payload: UserChangeEmailRequest,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> User:
    if not verify_password(payload.current_password, current.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    next_email = str(payload.email).lower().strip()
    exists = db.scalar(select(User).where(User.email == next_email, User.id != current.id))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    current.email = next_email
    db.add(current)
    db.commit()
    db.refresh(current)
    return current


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Response:
    db.delete(current)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
