"""422 от Pydantic на /auth/* (без БД и без подмены get_db)."""

from __future__ import annotations

import pytest

from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/api/v1/auth/login", {"email": "a@example.com"}),
        ("/api/v1/auth/login", {"email": "not-an-email", "password": "password12345"}),
        ("/api/v1/auth/register", {"email": "new@example.com", "password": "short"}),
        ("/api/v1/auth/register", {"email": "bad", "password": "password12345"}),
        ("/api/v1/auth/refresh", {}),
    ],
)
def test_auth_validation_errors_422(client: TestClient, path: str, payload: dict[str, object]) -> None:
    res = client.post(path, json=payload)
    assert res.status_code == 422
