from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_token,
    hash_password,
    verify_password,
)
from app.core.rate_limit import limiter
from app.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, RefreshRequest, TokenPair, UserCreate, UserPublic

router = APIRouter()


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
@limiter.limit("15/hour")
def register(request: Request, payload: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    try:
        exists = db.scalar(select(User).where(User.email == str(payload.email)))
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        user = User(
            email=str(payload.email).lower(),
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Start PostgreSQL and try again.",
        ) from None


@router.post("/login", response_model=TokenPair)
@limiter.limit("30/minute")
def login(request: Request, payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenPair:
    try:
        user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
        return TokenPair(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )
    except OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Start PostgreSQL and try again.",
        ) from None


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("120/minute")
def refresh(request: Request, payload: RefreshRequest, db: Annotated[Session, Depends(get_db)]) -> TokenPair:
    try:
        user_id = get_user_id_from_token(payload.refresh_token, "refresh")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from None
    try:
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        return TokenPair(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )
    except OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Start PostgreSQL and try again.",
        ) from None
