"""Тесты GET /api/v1/me с подменой get_db."""

from __future__ import annotations

import uuid

from app.core.security import create_access_token
from app.models.user import User

from tests.factories import make_user


class _GetUserSession:
    def __init__(self, user: User | None) -> None:
        self._user = user

    def get(self, _model: type[User], pk: uuid.UUID) -> User | None:
        if self._user is None:
            return None
        return self._user if self._user.id == pk else None

    def close(self) -> None:
        pass

def test_me_success(client, override_db) -> None:
    user = make_user(email="me@example.com", full_name="Иван")
    override_db(_GetUserSession(user))
    token = create_access_token(user.id)
    res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "me@example.com"
    assert data["full_name"] == "Иван"
    assert data["id"] == str(user.id)
    assert data["is_active"] is True
    assert data["is_superuser"] is False


def test_me_missing_authorization(client, override_db) -> None:
    u = make_user()
    override_db(_GetUserSession(u))
    res = client.get("/api/v1/me")
    assert res.status_code == 401


def test_me_invalid_token(client, override_db) -> None:
    u = make_user()
    override_db(_GetUserSession(u))
    res = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


def test_me_user_not_in_db(client, override_db) -> None:
    user = make_user()
    token = create_access_token(user.id)
    override_db(_GetUserSession(None))
    res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_inactive_user(client, override_db) -> None:
    user = make_user(email="off@example.com", is_active=False)
    token = create_access_token(user.id)
    override_db(_GetUserSession(user))
    res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
