"""GET /api/v1/goals с подменой get_db."""

from __future__ import annotations

import uuid

from app.core.security import create_access_token
from app.models.goal import Goal
from app.models.user import User

from tests.factories import make_goal, make_user


class _ScalarResult:
    def __init__(self, rows: list[Goal]) -> None:
        self._rows = rows

    def all(self) -> list[Goal]:
        return self._rows


class _ListGoalsSession:
    def __init__(self, user: User, goals: list[Goal]) -> None:
        self._user = user
        self._goals = goals

    def get(self, model: type, pk: uuid.UUID) -> User | None:
        if model is User and self._user.id == pk:
            return self._user
        return None

    def scalars(self, _stmt: object) -> _ScalarResult:
        return _ScalarResult(self._goals)

    def close(self) -> None:
        pass


def test_list_goals_empty(client, override_db) -> None:
    user = make_user()
    override_db(_ListGoalsSession(user, []))
    token = create_access_token(user.id)
    res = client.get("/api/v1/goals", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == []


def test_list_goals_returns_items(client, override_db) -> None:
    user = make_user(email="goals@example.com")
    g1 = make_goal(user_id=user.id, title="Первая")
    g2 = make_goal(user_id=user.id, title="Вторая", domain="sport", status="paused")
    override_db(_ListGoalsSession(user, [g1, g2]))
    token = create_access_token(user.id)
    res = client.get("/api/v1/goals", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    titles = {row["title"] for row in data}
    assert titles == {"Первая", "Вторая"}
    for row in data:
        assert row["user_id"] == str(user.id)
        assert row["domain"] in ("programming", "sport")
