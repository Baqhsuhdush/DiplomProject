"""Тесты /auth/* с подменой get_db (без PostgreSQL)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.security import create_refresh_token
from app.models.user import User

from tests.factories import make_user as _make_user


class _StubSession:
    """Минимальная заглушка: только то, что вызывают хендлеры auth."""

    def close(self) -> None:
        pass


class _LoginSession(_StubSession):
    def __init__(self, user: User | None) -> None:
        self._user = user

    def scalar(self, _stmt: object) -> User | None:
        return self._user


def test_login_success(client, override_db) -> None:
    user = _make_user(email="ok@example.com", password="secret12345")
    override_db(_LoginSession(user))
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "ok@example.com", "password": "secret12345"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("access_token")
    assert data.get("refresh_token")
    assert data.get("token_type") == "bearer"


def test_login_invalid_credentials(client, override_db) -> None:
    override_db(_LoginSession(None))
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password1"},
    )
    assert res.status_code == 401


def test_login_wrong_password(client, override_db) -> None:
    user = _make_user(email="u@example.com", password="correct-pass-99")
    override_db(_LoginSession(user))
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "u@example.com", "password": "bad-password-99"},
    )
    assert res.status_code == 401


def test_login_inactive_user(client, override_db) -> None:
    user = _make_user(email="blocked@example.com", password="secret12345", is_active=False)
    override_db(_LoginSession(user))
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "blocked@example.com", "password": "secret12345"},
    )
    assert res.status_code == 403


class _RegisterSession(_StubSession):
    def scalar(self, _stmt: object) -> None:
        return None

    def add(self, _user: User) -> None:
        pass

    def commit(self) -> None:
        pass

    def refresh(self, user: User) -> None:
        user.id = uuid.uuid4()
        user.created_at = datetime.now(UTC)
        # В БД эти значения приходят из default, в заглушке задаем явно.
        user.is_active = True
        user.is_superuser = False
        user.reminder_quiet_enabled = False


def test_register_success(client, override_db) -> None:
    override_db(_RegisterSession())
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "longpass-88", "full_name": "New"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "newuser@example.com"
    assert data["full_name"] == "New"
    assert data["is_active"] is True
    assert "id" in data


class _RegisterConflictSession(_StubSession):
    def __init__(self) -> None:
        self._existing = _make_user(email="exists@example.com", password="secret12345")

    def scalar(self, _stmt: object) -> User:
        return self._existing

    def add(self, _user: User) -> None:
        pass

    def commit(self) -> None:
        pass

    def refresh(self, _user: User) -> None:
        pass


def test_register_email_conflict(client, override_db) -> None:
    override_db(_RegisterConflictSession())
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "exists@example.com", "password": "other-pass-99"},
    )
    assert res.status_code == 409


class _RefreshSession(_StubSession):
    def __init__(self, user: User | None) -> None:
        self._user = user

    def get(self, _model: type[User], pk: uuid.UUID) -> User | None:
        if self._user is None:
            return None
        return self._user if self._user.id == pk else None


def test_refresh_success(client, override_db) -> None:
    user = _make_user()
    token = create_refresh_token(user.id)
    override_db(_RefreshSession(user))
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert res.status_code == 200
    data = res.json()
    assert data.get("access_token")
    assert data.get("refresh_token")


def test_refresh_invalid_token(client, override_db) -> None:
    override_db(_RefreshSession(_make_user()))
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert res.status_code == 401


def test_refresh_user_missing(client, override_db) -> None:
    """Валидный refresh, пользователь удалён из «БД»."""
    orphan_id = uuid.uuid4()
    token = create_refresh_token(orphan_id)
    override_db(_RefreshSession(None))
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert res.status_code == 401
