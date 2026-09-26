"""Фабрики моделей для тестов (без БД)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.security import hash_password
from app.models.goal import Goal
from app.models.user import User


def make_user(
    *,
    email: str = "user@example.com",
    password: str = "password12345",
    is_active: bool = True,
    user_id: uuid.UUID | None = None,
    full_name: str | None = None,
    is_superuser: bool = False,
) -> User:
    return User(
        id=user_id or uuid.uuid4(),
        email=email.lower(),
        password_hash=hash_password(password),
        full_name=full_name,
        timezone=None,
        is_active=is_active,
        is_superuser=is_superuser,
        reminder_quiet_enabled=False,
        reminder_quiet_start_hour_local=None,
        reminder_quiet_end_hour_local=None,
        created_at=datetime.now(UTC),
    )


def make_goal(
    *,
    user_id: uuid.UUID,
    title: str = "Тестовая цель",
    domain: str = "programming",
    status: str = "active",
    goal_id: uuid.UUID | None = None,
) -> Goal:
    return Goal(
        id=goal_id or uuid.uuid4(),
        user_id=user_id,
        domain=domain,
        title=title,
        target_date=None,
        priority=3,
        status=status,
        created_at=datetime.now(UTC),
    )
